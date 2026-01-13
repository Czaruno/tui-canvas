// IPC hook for canvas-side communication with controller (Solid.js version)
// Canvas connects as a client to the controller's server

declare const process: any;

import { createSignal, onMount, onCleanup } from "solid-js";
import { connectWithRetry, type IPCClient } from "./client";
import type { ControllerMessage } from "./types";

export interface UseIPCOptions {
  socketPath: string | undefined;
  scenario: string;
  onClose?: () => void;
  onUpdate?: (config: unknown) => void;
  onGetSelection?: () => { selectedText: string; startOffset: number; endOffset: number } | null;
  onGetContent?: () => { content: string; cursorPosition: number };
}

export interface IPCHandle {
  isConnected: () => boolean;
  sendReady: () => void;
  sendSelected: (data: unknown) => void;
  sendCancelled: (reason?: string) => void;
  sendError: (message: string) => void;
}

// Debug logging for IPC
import { appendFileSync } from "fs";
function ipcDebugLog(msg: string) {
  try { appendFileSync("/tmp/canvas-debug.log", `[IPC] ${msg}\n`); } catch {}
}

export function useIPC(options: UseIPCOptions): IPCHandle {
  const { socketPath, scenario, onClose, onUpdate, onGetSelection, onGetContent } = options;
  const [isConnected, setIsConnected] = createSignal(false);
  let client: IPCClient | null = null;

  ipcDebugLog(`useIPC called with socketPath: ${socketPath}`);

  // Connect immediately when hook is called (don't wait for onMount which may not fire in OpenTUI)
  if (socketPath) {
    ipcDebugLog(`Attempting to connect to ${socketPath}`);
    // Use an async IIFE to connect
    (async () => {
      try {
        ipcDebugLog(`Calling connectWithRetry...`);
        client = await connectWithRetry({
          socketPath,
          onMessage: (msg: ControllerMessage) => {
            ipcDebugLog(`Received message: ${msg.type}`);
            switch (msg.type) {
              case "close":
                onClose?.();
                process.exit(0);
                break;
              case "update":
                onUpdate?.(msg.config);
                break;
              case "ping":
                client?.send({ type: "pong" });
                break;
              case "getSelection":
                const selection = onGetSelection?.() || null;
                client?.send({ type: "selection", data: selection });
                break;
              case "getContent":
                const contentData = onGetContent?.();
                if (contentData) {
                  client?.send({ type: "content", data: contentData });
                }
                break;
            }
          },
          onDisconnect: () => {
            ipcDebugLog(`Disconnected from server`);
            setIsConnected(false);
          },
          onError: (err) => {
            ipcDebugLog(`Error: ${err.message}`);
          },
        });

        ipcDebugLog(`Connected successfully!`);
        setIsConnected(true);
        // Send ready message automatically
        ipcDebugLog(`Sending ready message for scenario: ${scenario}`);
        client.send({ type: "ready", scenario });
      } catch (err) {
        ipcDebugLog(`Connection failed: ${(err as Error).message}`);
        // Connection failed - canvas will work in standalone mode
      }
    })();
  } else {
    ipcDebugLog(`No socketPath provided, running in standalone mode`);
  }

  onCleanup(() => {
    client?.close();
    client = null;
  });

  const sendReady = () => {
    client?.send({ type: "ready", scenario });
  };

  const sendSelected = (data: unknown) => {
    client?.send({ type: "selected", data });
  };

  const sendCancelled = (reason?: string) => {
    client?.send({ type: "cancelled", reason });
  };

  const sendError = (message: string) => {
    client?.send({ type: "error", message });
  };

  return {
    isConnected,
    sendReady,
    sendSelected,
    sendCancelled,
    sendError,
  };
}
