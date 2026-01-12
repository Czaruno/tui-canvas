// IPC Message Types for OpenCode Canvas

// Messages sent from Canvas to Controller (OpenCode)
export type CanvasMessage =
  | { type: "ready"; scenario: string }
  | { type: "selected"; data: unknown }
  | { type: "cancelled"; reason?: string }
  | { type: "error"; message: string }
  | { type: "pong" }
  | { type: "selection"; data: unknown }
  | { type: "content"; data: unknown };

// Messages sent from Controller (OpenCode) to Canvas
export type ControllerMessage =
  | { type: "update"; config: unknown }
  | { type: "close" }
  | { type: "ping" }
  | { type: "getSelection" }
  | { type: "getContent" };

// Get socket path for a canvas instance
export function getSocketPath(id: string): string {
  return `/tmp/canvas-${id}.sock`;
}
