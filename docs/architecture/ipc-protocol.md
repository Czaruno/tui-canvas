# IPC Protocol

OpenCode Canvas uses Unix domain sockets for inter-process communication between the controller (OpenCode) and canvas instances.

## Socket Location

```
/tmp/canvas-{id}.sock
```

Where `{id}` is the unique canvas instance identifier (e.g., `calendar-1736712345678`).

## Message Format

All messages are JSON objects terminated by newline (`\n`).

```json
{"type": "message_type", "field": "value"}\n
```

## Canvas → Controller Messages

### ready

Sent when canvas is initialized and ready for interaction.

```json
{
  "type": "ready",
  "scenario": "display" | "meeting-picker" | "edit" | "email-preview" | "booking"
}
```

### selected

Sent when user makes a selection.

```json
{
  "type": "selected",
  "data": <scenario-specific-data>
}
```

**Calendar (meeting-picker)**:
```json
{
  "type": "selected",
  "data": {
    "startTime": "2026-01-15T14:00:00.000Z",
    "endTime": "2026-01-15T14:30:00.000Z",
    "duration": 30
  }
}
```

**Document (edit)**:
```json
{
  "type": "selected",
  "data": {
    "selectedText": "Hello world",
    "startOffset": 10,
    "endOffset": 21,
    "startLine": 1,
    "endLine": 1,
    "startColumn": 5,
    "endColumn": 16
  }
}
```

**Flight (booking)**:
```json
{
  "type": "selected",
  "data": {
    "selectedFlight": { /* flight object */ },
    "selectedSeat": "15A"
  }
}
```

### cancelled

Sent when user cancels/quits without selection.

```json
{
  "type": "cancelled",
  "reason": "User pressed escape"
}
```

### error

Sent when an error occurs.

```json
{
  "type": "error",
  "message": "Failed to load configuration"
}
```

### pong

Response to ping health check.

```json
{
  "type": "pong"
}
```

### selection

Response to getSelection request (document canvas).

```json
{
  "type": "selection",
  "data": {
    "selectedText": "...",
    "startOffset": 0,
    "endOffset": 10
  }
}
```

### content

Response to getContent request (document canvas).

```json
{
  "type": "content",
  "data": {
    "content": "# Full document content...",
    "cursorPosition": 42
  }
}
```

## Controller → Canvas Messages

### update

Update canvas configuration.

```json
{
  "type": "update",
  "config": {
    "content": "# Updated content",
    "title": "New Title"
  }
}
```

### close

Request canvas to close.

```json
{
  "type": "close"
}
```

### ping

Health check.

```json
{
  "type": "ping"
}
```

### getSelection

Request current text selection (document canvas).

```json
{
  "type": "getSelection"
}
```

### getContent

Request current document content.

```json
{
  "type": "getContent"
}
```

## Connection Flow

The MCP server (controller) creates the socket server FIRST, then spawns the canvas which connects as a client:

```
Controller (MCP Server)                    Canvas (Spawned Process)
    │                                        │
    │   1. Create socket server              │
    │   /tmp/canvas-{instanceId}.sock        │
    │                                        │
    │   2. Spawn canvas process              │
    │──────────────────────────────────────►│
    │                                        │
    │   3. Canvas connects as client         │
    │◄──────────────────────────────────────│
    │                                        │
    │   4. Canvas sends "ready"              │
    │◄──────────────────────────────────────│
    │                                        │
    │   5. Bidirectional messaging           │
    │◄─────────────────────────────────────►│
    │                                        │
    │   6. Canvas sends "selected/cancelled" │
    │◄──────────────────────────────────────│
    │                                        │
    │   7. Canvas disconnects & exits        │
    │   8. Controller cleans up socket       │
    │                                        │
```

**Key Implementation Files:**
- `packages/core/src/ipc/server.ts` - `createControllerServer()` for MCP server
- `packages/core/src/ipc/client.ts` - `connectWithRetry()` for canvas
- `packages/core/src/canvases/calendar/hooks/use-ipc.ts` - React hook for canvases

## Error Handling

- If socket connection fails, retry up to 10 times with 100ms delay
- If canvas disconnects unexpectedly, controller receives disconnect event
- Malformed JSON messages trigger error callback but don't crash
