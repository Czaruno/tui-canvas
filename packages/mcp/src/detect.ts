/**
 * Harness Detection
 * 
 * Detects which AI coding harness is running this MCP server.
 * This allows us to adapt behavior for different environments.
 */

export type HarnessType = 
  | 'opencode'    // OpenCode (opencode.ai)
  | 'claude'      // Claude Code (Anthropic)
  | 'cursor'      // Cursor IDE
  | 'codex'       // OpenAI Codex / ChatGPT
  | 'gemini'      // Gemini CLI (Google)
  | 'grok'        // Grok CLI (xAI)
  | 'generic';    // Unknown / generic MCP client

export interface HarnessInfo {
  type: HarnessType;
  name: string;
  version?: string;
  features: {
    /** Supports tmux pane spawning */
    tmuxPanes: boolean;
    /** Supports IPC communication */
    ipc: boolean;
    /** Supports waiting for user input */
    waitForResult: boolean;
  };
}

/**
 * Detect the current AI harness from environment variables and context
 */
export function detectHarness(): HarnessInfo {
  // Check for OpenCode
  if (process.env.OPENCODE || process.env.OPENCODE_SESSION) {
    return {
      type: 'opencode',
      name: 'OpenCode',
      version: process.env.OPENCODE_VERSION,
      features: {
        tmuxPanes: true,
        ipc: true,
        waitForResult: true,
      },
    };
  }

  // Check for Claude Code
  if (process.env.CLAUDE_CODE || process.env.ANTHROPIC_API_KEY) {
    return {
      type: 'claude',
      name: 'Claude Code',
      features: {
        tmuxPanes: true,
        ipc: true,
        waitForResult: true,
      },
    };
  }

  // Check for Cursor
  if (process.env.CURSOR_SESSION || process.env.CURSOR_TRACE_ID) {
    return {
      type: 'cursor',
      name: 'Cursor',
      features: {
        tmuxPanes: true,
        ipc: true,
        waitForResult: true,
      },
    };
  }

  // Check for Codex/ChatGPT
  if (process.env.OPENAI_API_KEY && process.env.CODEX_SESSION) {
    return {
      type: 'codex',
      name: 'Codex',
      features: {
        tmuxPanes: true,
        ipc: true,
        waitForResult: true,
      },
    };
  }

  // Check for Gemini CLI (Google)
  if (process.env.GEMINI_CLI || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) {
    return {
      type: 'gemini',
      name: 'Gemini CLI',
      features: {
        tmuxPanes: true,
        ipc: true,
        waitForResult: true,
      },
    };
  }

  // Check for Grok CLI (xAI)
  if (process.env.GROK_CLI || process.env.XAI_API_KEY || process.env.GROK_API_KEY) {
    return {
      type: 'grok',
      name: 'Grok CLI',
      features: {
        tmuxPanes: true,
        ipc: true,
        waitForResult: true,
      },
    };
  }

  // Generic MCP client
  return {
    type: 'generic',
    name: 'Generic MCP Client',
    features: {
      tmuxPanes: true,  // Assume tmux support
      ipc: true,
      waitForResult: true,
    },
  };
}

/**
 * Check if we're running in a tmux session
 */
export function isInTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * Check if we're running in a terminal (has TTY)
 */
export function isInTerminal(): boolean {
  return process.stdout.isTTY || process.stdin.isTTY;
}

/**
 * Get tmux session info if available
 */
export function getTmuxInfo(): { socket: string; session: string; pane: string } | null {
  if (!process.env.TMUX) return null;
  
  const parts = process.env.TMUX.split(',');
  return {
    socket: parts[0] || '',
    session: parts[1] || '',
    pane: process.env.TMUX_PANE || '',
  };
}
