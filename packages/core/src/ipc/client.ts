// IPC Client - Canvas side
// Connects to the controller's Unix domain socket

import type { ControllerMessage, CanvasMessage } from "./types";
import { appendFileSync } from "fs";

function clientDebugLog(msg: string) {
  try { appendFileSync("/tmp/canvas-debug.log", `[IPC-CLIENT] ${msg}\n`); } catch {}
}

export interface IPCClientOptions {
  socketPath: string;
  onMessage: (msg: ControllerMessage) => void;
  onDisconnect: () => void;
  onError?: (error: Error) => void;
}

export interface IPCClient {
  send: (msg: CanvasMessage) => void;
  close: () => void;
  isConnected: () => boolean;
}

export async function connectToController(
  options: IPCClientOptions
): Promise<IPCClient> {
  const { socketPath, onMessage, onDisconnect, onError } = options;

  let connected = false;
  let buffer = "";

  clientDebugLog(`Connecting to socket: ${socketPath}`);
  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      open(_socket) {
        clientDebugLog(`Socket open callback fired`);
        connected = true;
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

      close() {
        connected = false;
        onDisconnect();
      },

      error(_socket, error) {
        onError?.(error);
      },
    },
  });

  connected = true;

  return {
    send(msg: CanvasMessage) {
      const data = JSON.stringify(msg) + "\n";
      clientDebugLog(`Sending message (connected=${connected}): ${data.trim()}`);
      if (connected) {
        const written = socket.write(data);
        clientDebugLog(`socket.write returned: ${written}`);
      } else {
        clientDebugLog(`NOT CONNECTED - message not sent`);
      }
    },

    close() {
      socket.end();
      connected = false;
    },

    isConnected() {
      return connected;
    },
  };
}

// Attempt to connect with retries
export async function connectWithRetry(
  options: IPCClientOptions,
  maxRetries = 10,
  retryDelayMs = 100
): Promise<IPCClient> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await connectToController(options);
    } catch (e) {
      lastError = e as Error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw lastError || new Error("Failed to connect to controller");
}

// Create an IPC client for controller side (deprecated - use createControllerServer instead)
export async function createIPCClient(options: {
  socketPath: string;
  onMessage: (msg: CanvasMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}): Promise<{ send: (msg: ControllerMessage) => void; close: () => void }> {
  const { socketPath, onMessage, onConnect, onDisconnect, onError } = options;

  let buffer = "";
  let socket: any = null;

  socket = await Bun.connect({
    unix: socketPath,
    socket: {
      open(socket) {
        onConnect?.();
      },

      data(socket, data) {
        buffer += data.toString();

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

      close() {
        onDisconnect?.();
      },

      error(socket, error) {
        onError?.(error);
      },
    },
  });

  return {
    send(msg: ControllerMessage) {
      if (socket) {
        socket.write(JSON.stringify(msg) + "\n");
      }
    },

    close() {
      if (socket) {
        socket.end();
        socket = null;
      }
    },
  };
}
