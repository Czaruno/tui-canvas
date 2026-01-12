#!/usr/bin/env bun
/**
 * TUI Canvas - MCP Server
 * 
 * Universal MCP server that provides interactive terminal canvases
 * for AI coding assistants (OpenCode, Claude Code, Cursor, Gemini CLI, Grok CLI, etc.)
 * 
 * Usage:
 *   npx tui-canvas          # Start MCP server (stdio)
 *   bunx tui-canvas         # Start MCP server (stdio)
 * 
 * MCP Config (add to your AI harness config):
 *   {
 *     "mcpServers": {
 *       "tui-canvas": {
 *         "command": "npx",
 *         "args": ["tui-canvas"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { detectHarness, isInTmux } from './detect.js';
import { toolDefinitions } from './tools.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadRegistry, type CanvasRegistry } from '../../cli/src/registry.js';
import { spawnCanvas as spawnCanvasPane } from '../../cli/src/spawn.js';
import { createControllerServer } from '../../core/src/ipc/server.js';
import type { CanvasMessage } from '../../core/src/ipc/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANVASES_DIR = join(__dirname, '../../../canvases');

// Detect which harness we're running in
const harness = detectHarness();

// Registry instance (loaded lazily)
let registry: CanvasRegistry | null = null;

async function getRegistry(): Promise<CanvasRegistry> {
  if (!registry) {
    registry = await loadRegistry(CANVASES_DIR);
  }
  return registry;
}

// Create MCP server
const server = new Server(
  {
    name: 'tui-canvas',
    version: '0.3.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
  return {
    tools: Object.values(toolDefinitions),
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;

  // Check tmux requirement
  if (!isInTmux()) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'TUI Canvas requires a tmux session. Please run your AI harness inside tmux.',
            harness: harness.name,
          }),
        },
      ],
    };
  }

  try {
    switch (name) {
      case 'canvas_calendar':
        return await handleCanvas('calendar', args);
      case 'canvas_document':
        return await handleCanvas('document', args);
      case 'canvas_flight':
        return await handleCanvas('flight', args);
      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, error: `Unknown tool: ${name}` }),
            },
          ],
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
    };
  }
});

/**
 * Determine if a scenario should wait for results by default
 */
function shouldWaitByDefault(canvasId: string, scenario: string): boolean {
  // Interactive scenarios that expect user selection
  if (canvasId === 'calendar' && scenario === 'meeting-picker') return true;
  if (canvasId === 'document' && scenario === 'edit') return true;
  if (canvasId === 'flight') return true; // flight booking always waits
  return false;
}

/**
 * Wait for canvas IPC result with timeout
 */
async function waitForCanvasResult(
  socketPath: string,
  timeout: number = 300000 // 5 minutes default
): Promise<{ success: boolean; data?: unknown; cancelled?: boolean; error?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let server: Awaited<ReturnType<typeof createControllerServer>> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (server) {
        server.close();
        server = null;
      }
    };

    const handleMessage = (msg: CanvasMessage) => {
      if (resolved) return;

      switch (msg.type) {
        case 'ready':
          // Canvas is ready - just acknowledge, keep waiting
          console.error(`[tui-canvas] Canvas ready`);
          break;

        case 'selected':
          resolved = true;
          cleanup();
          resolve({
            success: true,
            data: msg.data,
          });
          break;

        case 'cancelled':
          resolved = true;
          cleanup();
          resolve({
            success: true,
            cancelled: true,
          });
          break;

        case 'error':
          resolved = true;
          cleanup();
          resolve({
            success: false,
            error: msg.message,
          });
          break;

        case 'pong':
          // Keepalive response, ignore
          break;
      }
    };

    // Start IPC server to listen for canvas messages
    createControllerServer({
      socketPath,
      onMessage: handleMessage,
      onClientConnect: () => {
        console.error(`[tui-canvas] Canvas connected via IPC`);
      },
      onClientDisconnect: () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            success: false,
            error: 'Canvas disconnected unexpectedly',
          });
        }
      },
      onError: (error) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            success: false,
            error: error.message,
          });
        }
      },
    }).then((s) => {
      server = s;
    }).catch((err) => {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          error: `Failed to start IPC server: ${err.message}`,
        });
      }
    });

    // Set timeout
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server?.send({ type: 'close' });
        cleanup();
        resolve({
          success: false,
          error: 'Timeout waiting for user selection',
        });
      }
    }, timeout);
  });
}

/**
 * Generic handler for spawning any canvas type
 */
async function handleCanvas(
  canvasId: string,
  args: Record<string, unknown> | undefined
) {
  const reg = await getRegistry();
  const entry = reg.get(canvasId);
  
  if (!entry) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ 
            success: false, 
            error: `Canvas not found: ${canvasId}` 
          }),
        },
      ],
    };
  }
  
  const { manifest, path: canvasPath } = entry;
  
  // Determine scenario
  let scenario = (args?.scenario as string) || 'display';
  if (scenario === 'default') {
    scenario = Object.keys(manifest.scenarios)[0];
  }
  
  // Get implementation (use default)
  const implName = manifest.defaultImplementation;
  const implementation = manifest.implementations[implName];
  
  if (!implementation) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ 
            success: false, 
            error: `Implementation not found: ${implName}` 
          }),
        },
      ],
    };
  }
  
  // Parse config - handle both string and object forms
  let config: unknown;
  if (args?.config) {
    if (typeof args.config === 'string') {
      try {
        config = JSON.parse(args.config);
      } catch {
        config = args.config;
      }
    } else {
      config = args.config;
    }
  }
  
  // For document canvas, content can be passed directly
  if (canvasId === 'document' && args?.content) {
    config = {
      ...(config as object || {}),
      content: args.content,
      title: args.title,
      scenario,
    };
  }
  
  // Determine if we should wait for result
  const waitForResult = args?.waitForResult !== undefined 
    ? Boolean(args.waitForResult)
    : shouldWaitByDefault(canvasId, scenario);
  
  const timeout = (args?.timeout as number) || 300000; // 5 minutes default
  
  // Generate instance ID
  const instanceId = `${canvasId}-${Date.now()}`;
  const socketPath = `/tmp/canvas-${instanceId}.sock`;
  
  // If waiting for result, start IPC server BEFORE spawning canvas
  let ipcResultPromise: Promise<{ success: boolean; data?: unknown; cancelled?: boolean; error?: string }> | null = null;
  if (waitForResult) {
    ipcResultPromise = waitForCanvasResult(socketPath, timeout);
    // Give the server a moment to start listening
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // Spawn the canvas
  const spawnResult = await spawnCanvasPane({
    manifest,
    implementation,
    canvasPath,
    scenario,
    config,
    instanceId,
    socketPath,
    useTmux: true,
  });
  
  if (!spawnResult.success) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: spawnResult.error,
            harness: harness.name,
          }),
        },
      ],
    };
  }
  
  // If not waiting for result, return immediately
  if (!waitForResult || !ipcResultPromise) {
    // Cleanup socket file (not needed since we're not waiting)
    try {
      const { unlinkSync, existsSync } = await import('fs');
      if (existsSync(socketPath)) {
        unlinkSync(socketPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `${manifest.name} canvas opened in tmux pane`,
            paneId: spawnResult.paneId,
            instanceId: spawnResult.instanceId,
            harness: harness.name,
          }),
        },
      ],
    };
  }
  
  // Wait for canvas result via IPC
  console.error(`[tui-canvas] Waiting for user interaction...`);
  const ipcResult = await ipcResultPromise;
  
  // Cleanup temp config file
  try {
    const configFile = `/tmp/canvas-config-${instanceId}.json`;
    const { unlinkSync, existsSync } = await import('fs');
    if (existsSync(configFile)) {
      unlinkSync(configFile);
    }
  } catch {
    // Ignore cleanup errors
  }
  
  if (ipcResult.cancelled) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            cancelled: true,
            message: 'User cancelled the selection',
            paneId: spawnResult.paneId,
            instanceId: spawnResult.instanceId,
            harness: harness.name,
          }),
        },
      ],
    };
  }
  
  if (!ipcResult.success) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: ipcResult.error,
            paneId: spawnResult.paneId,
            instanceId: spawnResult.instanceId,
            harness: harness.name,
          }),
        },
      ],
    };
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          data: ipcResult.data,
          message: 'User made a selection',
          paneId: spawnResult.paneId,
          instanceId: spawnResult.instanceId,
          harness: harness.name,
        }),
      },
    ],
  };
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log startup info to stderr (stdout is for MCP protocol)
  console.error(`[tui-canvas] MCP server started`);
  console.error(`[tui-canvas] Detected harness: ${harness.name} (${harness.type})`);
  console.error(`[tui-canvas] tmux: ${isInTmux() ? 'yes' : 'no'}`);
  console.error(`[tui-canvas] Canvases dir: ${CANVASES_DIR}`);
}

main().catch((error) => {
  console.error('[tui-canvas] Fatal error:', error);
  process.exit(1);
});
