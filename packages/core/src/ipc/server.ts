// IPC Server - Canvas side
// Listens on a Unix domain socket for controller commands

import type { ControllerMessage, CanvasMessage } from "./types";
import { unlinkSync, existsSync, appendFileSync } from "fs";

function serverDebugLog(msg: string) {
  try { appendFileSync("/tmp/canvas-debug.log", `[IPC-SERVER] ${msg}\n`); } catch {}
}

export interface IPCServerOptions {
  socketPath: string;
  onMessage: (msg: ControllerMessage) => void;
  onClientConnect?: () => void;
  onClientDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface IPCServer {
  broadcast: (msg: CanvasMessage) => void;
  close: () => void;
}

/**
 * Create an IPC server for the CANVAS side.
 * Canvas listens for ControllerMessages and sends CanvasMessages.
 */
export async function createIPCServer(options: IPCServerOptions): Promise<IPCServer> {
  const { socketPath, onMessage, onClientConnect, onClientDisconnect, onError } = options;

  // Remove existing socket file if it exists
  if (existsSync(socketPath)) {
    unlinkSync(socketPath);
  }

  const clients = new Set<any>();
  let buffer = "";

  const server = Bun.listen({
    unix: socketPath,
    socket: {
      open(socket) {
        clients.add(socket);
        onClientConnect?.();
      },

      data(_socket, data) {
        // Accumulate data and parse complete JSON messages
        buffer += data.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const msg = JSON.parse(line) as ControllerMessage;
              onMessage(msg);
            } catch (e) {
              onError?.(new Error(`Failed to parse message: ${line}`));
            }
          }
        }
      },

      close(socket) {
        clients.delete(socket);
        onClientDisconnect?.();
      },

      error(_socket, error) {
        onError?.(error);
      },
    },
  });

  return {
    broadcast(msg: CanvasMessage) {
      const data = JSON.stringify(msg) + "\n";
      for (const client of clients) {
        client.write(data);
      }
    },

    close() {
      server.stop();
      if (existsSync(socketPath)) {
        unlinkSync(socketPath);
      }
    },
  };
}

// ============================================
// Controller-side Server
// ============================================

export interface ControllerServerOptions {
  socketPath: string;
  onMessage: (msg: CanvasMessage) => void;
  onClientConnect?: () => void;
  onClientDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface ControllerServer {
  send: (msg: ControllerMessage) => void;
  close: () => void;
}

/**
 * Create an IPC server for the CONTROLLER side.
 * Controller listens for CanvasMessages and sends ControllerMessages.
 * Used by the high-level API to spawn canvases and wait for results.
 */
export async function createControllerServer(options: ControllerServerOptions): Promise<ControllerServer> {
  const { socketPath, onMessage, onClientConnect, onClientDisconnect, onError } = options;

  serverDebugLog(`Creating controller server on: ${socketPath}`);

  // Remove existing socket file if it exists
  if (existsSync(socketPath)) {
    serverDebugLog(`Removing existing socket file`);
    unlinkSync(socketPath);
  }

  const clients = new Set<any>();
  let buffer = "";

  serverDebugLog(`Calling Bun.listen on unix socket`);
  const server = Bun.listen({
    unix: socketPath,
    socket: {
      open(socket) {
        serverDebugLog(`Socket open callback - client connected`);
        clients.add(socket);
        onClientConnect?.();
      },

      data(_socket, data) {
        // Accumulate data and parse complete JSON messages
        const rawData = data.toString();
        serverDebugLog(`Received raw data: ${rawData.trim()}`);
        buffer += rawData;

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const msg = JSON.parse(line) as CanvasMessage;
              onMessage(msg);
            } catch (e) {
              onError?.(new Error(`Failed to parse message: ${line}`));
            }
          }
        }
      },

      close(socket) {
        clients.delete(socket);
        onClientDisconnect?.();
      },

      error(_socket, error) {
        onError?.(error);
      },
    },
  });

  return {
    send(msg: ControllerMessage) {
      const data = JSON.stringify(msg) + "\n";
      for (const client of clients) {
        client.write(data);
      }
    },

    close() {
      server.stop();
      if (existsSync(socketPath)) {
        unlinkSync(socketPath);
      }
    },
  };
}
