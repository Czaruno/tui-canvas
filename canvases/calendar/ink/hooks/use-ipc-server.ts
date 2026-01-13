// IPC hook for canvas running as server (standalone CLI mode)

import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "ink";
import { createIPCServer, type IPCServer } from "../../../../packages/core/src/ipc/server";
import type { CanvasMessage, ControllerMessage } from "../../../../packages/core/src/ipc/types";

export interface UseIPCServerOptions {
  socketPath: string | undefined;
  scenario: string;
  onClose?: () => void;
  onUpdate?: (config: unknown) => void;
  onGetSelection?: () => { selectedText: string; startOffset: number; endOffset: number } | null;
  onGetContent?: () => { content: string; cursorPosition: number };
}

export interface IPCServerHandle {
  isConnected: boolean;
  sendReady: () => void;
  sendSelected: (data: unknown) => void;
  sendCancelled: (reason?: string) => void;
  sendError: (message: string) => void;
}

export function useIPCServer(options: UseIPCServerOptions): IPCServerHandle {
  const { socketPath, scenario, onClose, onUpdate, onGetSelection, onGetContent } = options;
  const { exit } = useApp();
  const [isConnected, setIsConnected] = useState(false);
  const serverRef = useRef<IPCServer | null>(null);
  const onCloseRef = useRef(onClose);
  const onUpdateRef = useRef(onUpdate);
  const onGetSelectionRef = useRef(onGetSelection);
  const onGetContentRef = useRef(onGetContent);

  useEffect(() => {
    onCloseRef.current = onClose;
    onUpdateRef.current = onUpdate;
    onGetSelectionRef.current = onGetSelection;
    onGetContentRef.current = onGetContent;
  }, [onClose, onUpdate, onGetSelection, onGetContent]);

  // Start server on mount
  useEffect(() => {
    if (!socketPath) {
      return;
    }

    let mounted = true;

    const startServer = async () => {
      try {
        const server = await createIPCServer({
          socketPath,
          onMessage: (msg: ControllerMessage) => {
            switch (msg.type) {
              case "close":
                onCloseRef.current?.();
                exit();
                break;
              case "update":
                onUpdateRef.current?.(msg.config);
                break;
              case "ping":
                server.broadcast({ type: "pong" });
                break;
              case "getSelection":
                const selection = onGetSelectionRef.current?.() || null;
                server.broadcast({ type: "selection", data: selection });
                break;
              case "getContent":
                const contentData = onGetContentRef.current?.();
                if (contentData) {
                  server.broadcast({ type: "content", data: contentData });
                }
                break;
            }
          },
          onClientConnect: () => {
            if (mounted) {
              setIsConnected(true);
              // Send ready message when client connects
              server.broadcast({ type: "ready", scenario });
            }
          },
          onClientDisconnect: () => {
            if (mounted) {
              setIsConnected(false);
            }
          },
          onError: (_err) => {
            // Error handled silently
          },
        });

        if (mounted) {
          serverRef.current = server;
        } else {
          server.close();
        }
      } catch (_err) {
        // Server start failed - canvas will work in standalone mode
      }
    };

    startServer();

    return () => {
      mounted = false;
      serverRef.current?.close();
      serverRef.current = null;
    };
  }, [socketPath, scenario, exit]);

  const sendReady = useCallback(() => {
    serverRef.current?.broadcast({ type: "ready", scenario });
  }, [scenario]);

  const sendSelected = useCallback((data: unknown) => {
    serverRef.current?.broadcast({ type: "selected", data });
  }, []);

  const sendCancelled = useCallback((reason?: string) => {
    serverRef.current?.broadcast({ type: "cancelled", reason });
  }, []);

  const sendError = useCallback((message: string) => {
    serverRef.current?.broadcast({ type: "error", message });
  }, []);

  return {
    isConnected,
    sendReady,
    sendSelected,
    sendCancelled,
    sendError,
  };
}
