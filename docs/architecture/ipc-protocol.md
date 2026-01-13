# TUI Canvas IPC Protocol

> Definitive reference for the IPC architecture based on the proven Claude Canvas pattern.

## Architecture Overview

The IPC system uses Unix domain sockets for communication between the **Controller** (MCP server/AI harness) and **Canvas** (terminal UI process).

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CONTROLLER (MCP Server)                      │
│                                                                      │
│  1. createIPCServer(socketPath)  ─────────────────────────┐         │
│     - Creates Unix socket at /tmp/canvas-{id}.sock        │         │
│     - Listens for canvas client connections               │         │
│                                                           │         │
│  2. spawnCanvas(kind, id, config, {socketPath})           │         │
│     - Spawns canvas process in tmux pane                  │         │
│     - Passes socketPath as argument                       ▼         │
│                                                                      │
│  3. Wait for messages from canvas client ◄────────────────┐         │
│     - "ready" → canvas is initialized                     │         │
│     - "selected" → user made selection (resolve promise)  │         │
│     - "cancelled" → user cancelled (resolve promise)      │         │
│     - "error" → something went wrong (resolve promise)    │         │
└───────────────────────────────────────────────────────────┼─────────┘
                                                            │
                          Unix Socket                       │
                    /tmp/canvas-{id}.sock                   │
                                                            │
┌───────────────────────────────────────────────────────────┼─────────┐
│                         CANVAS (Terminal UI)              │         │
│                                                           │         │
│  1. Receive socketPath as CLI argument                    │         │
│                                                           │         │
│  2. connectWithRetry(socketPath)  ────────────────────────┘         │
│     - Connects as CLIENT to controller's server                     │
│     - Retries up to 10 times with 100ms delay                       │
│                                                                      │
│  3. Send "ready" message immediately after connecting               │
│                                                                      │
│  4. Handle user interaction                                          │
│     - On selection: send "selected" + exit                          │
│     - On cancel (q/Esc): send "cancelled" + exit                    │
│     - On error: send "error" + exit                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Principle

**The Controller creates the server FIRST, then spawns the Canvas which connects as a client.**

This is critical because:
1. The socket must exist before the canvas tries to connect
2. The canvas uses `connectWithRetry` to handle the brief startup delay
3. The controller waits for messages until timeout or result

## Message Types

### Controller → Canvas (ControllerMessage)

```typescript
type ControllerMessage =
  | { type: "close" }           // Tell canvas to exit
  | { type: "update"; config: unknown }  // Update canvas config
  | { type: "ping" }            // Keepalive check
  | { type: "getSelection" }    // Request current selection (document)
  | { type: "getContent" };     // Request current content (document)
```

### Canvas → Controller (CanvasMessage)

```typescript
type CanvasMessage =
  | { type: "ready"; scenario: string }  // Canvas initialized
  | { type: "selected"; data: unknown }  // User made selection
  | { type: "cancelled"; reason?: string }  // User cancelled
  | { type: "error"; message: string }   // Error occurred
  | { type: "pong" }            // Response to ping
  | { type: "selection"; data: SelectionData | null }  // Selection response
  | { type: "content"; data: ContentData };  // Content response
```

## Implementation Pattern

### Controller Side (MCP Server)

```typescript
// packages/mcp/src/index.ts

async function waitForCanvasResult(
  socketPath: string,
  timeout: number = 300000
): Promise<CanvasResult> {
  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let server: ControllerServer | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      server?.close();
    };

    // STEP 1: Create server FIRST
    createControllerServer({
      socketPath,
      onMessage(msg: CanvasMessage) {
        if (resolved) return;
        
        switch (msg.type) {
          case "ready":
            // Canvas connected and ready - keep waiting
            break;
          case "selected":
            resolved = true;
            cleanup();
            resolve({ success: true, data: msg.data });
            break;
          case "cancelled":
            resolved = true;
            cleanup();
            resolve({ success: true, cancelled: true });
            break;
          case "error":
            resolved = true;
            cleanup();
            resolve({ success: false, error: msg.message });
            break;
        }
      },
      onClientDisconnect() {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: false, error: "Canvas disconnected" });
        }
      },
    }).then((s) => {
      server = s;
    });

    // Set timeout
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ success: false, error: "Timeout" });
      }
    }, timeout);
  });
}

async function handleCanvas(canvasId: string, args: unknown) {
  const socketPath = `/tmp/canvas-${canvasId}-${Date.now()}.sock`;
  
  // STEP 1: Start IPC server BEFORE spawning canvas
  const ipcResultPromise = waitForCanvasResult(socketPath, timeout);
  
  // Brief delay to ensure server is listening
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // STEP 2: Spawn canvas (which will connect as client)
  await spawnCanvasPane({
    socketPath,
    // ... other options
  });
  
  // STEP 3: Wait for result
  const result = await ipcResultPromise;
  return result;
}
```

### Canvas Side (useIPC Hook - React/Ink)

```typescript
// Canvas connects as CLIENT to controller's server

export function useIPC(options: UseIPCOptions): IPCHandle {
  const { socketPath, scenario, onClose, onUpdate } = options;
  const { exit } = useApp();
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef<IPCClient | null>(null);

  useEffect(() => {
    if (!socketPath) return;

    let mounted = true;

    const connect = async () => {
      try {
        // Connect as CLIENT to the controller's server
        const client = await connectWithRetry({
          socketPath,
          onMessage: (msg: ControllerMessage) => {
            switch (msg.type) {
              case "close":
                onClose?.();
                exit();
                break;
              case "update":
                onUpdate?.(msg.config);
                break;
              case "ping":
                client.send({ type: "pong" });
                break;
            }
          },
          onDisconnect: () => setIsConnected(false),
        });

        if (mounted) {
          clientRef.current = client;
          setIsConnected(true);
          // Send ready message immediately
          client.send({ type: "ready", scenario });
        }
      } catch (err) {
        // Connection failed - canvas works in standalone mode
      }
    };

    connect();

    return () => {
      mounted = false;
      clientRef.current?.close();
    };
  }, [socketPath, scenario, exit]);

  return {
    isConnected,
    sendSelected: (data) => clientRef.current?.send({ type: "selected", data }),
    sendCancelled: (reason) => clientRef.current?.send({ type: "cancelled", reason }),
    sendError: (msg) => clientRef.current?.send({ type: "error", message: msg }),
  };
}
```

### Canvas Side (useIPC Hook - Solid.js/OpenTUI)

**CRITICAL: OpenTUI/Solid.js Lifecycle Issue**

In OpenTUI, `onMount()` from solid-js does NOT fire reliably when using JSX syntax. The hook code must connect **immediately** when called, not inside `onMount`.

```typescript
// packages/core/src/ipc/use-ipc-solid.ts

export function useIPC(options: UseIPCOptions): IPCHandle {
  const { socketPath, scenario, onClose, onUpdate } = options;
  const [isConnected, setIsConnected] = createSignal(false);
  let client: IPCClient | null = null;

  // CRITICAL: Connect immediately, NOT in onMount (onMount doesn't fire in OpenTUI)
  if (socketPath) {
    (async () => {
      try {
        client = await connectWithRetry({
          socketPath,
          onMessage: (msg: ControllerMessage) => {
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
            }
          },
          onDisconnect: () => setIsConnected(false),
        });

        setIsConnected(true);
        client.send({ type: "ready", scenario });
      } catch (err) {
        // Connection failed - canvas works standalone
      }
    })();
  }

  onCleanup(() => client?.close());

  return {
    isConnected,
    sendSelected: (data) => client?.send({ type: "selected", data }),
    sendCancelled: (reason) => client?.send({ type: "cancelled", reason }),
    sendError: (msg) => client?.send({ type: "error", message: msg }),
  };
}
```

**CRITICAL: OpenTUI Render Pattern**

When using OpenTUI's `render()` function, you must call the component **directly** (not via JSX) to ensure hooks execute synchronously:

```typescript
// WRONG - JSX defers execution, hooks don't run
export function runCalendar(props: CalendarAppProps) {
  render(() => <CalendarApp {...props} />, { useThread: false });
}

// CORRECT - Direct call ensures hooks run immediately
export function runCalendar(props: CalendarAppProps) {
  render(() => CalendarApp(props), { useThread: false });
}
```

## Socket Files

- **Path**: `/tmp/canvas-{instanceId}.sock`
- **Created by**: Controller (MCP server)
- **Connected to by**: Canvas (terminal UI)
- **Cleaned up by**: Controller on completion/timeout

## Connection Flow

```
Time →

Controller                          Canvas
    │                                  │
    │  createControllerServer()        │
    │  ────────────────────►           │
    │  (socket created)                │
    │                                  │
    │  spawnCanvas()                   │
    │  ────────────────────────────►   │
    │                                  │ (process starts)
    │                                  │
    │                                  │  connectWithRetry()
    │  ◄────────────────────────────   │
    │  (client connects)               │
    │                                  │
    │  ◄──── { type: "ready" } ────    │
    │                                  │
    │         ... user interaction ... │
    │                                  │
    │  ◄── { type: "selected" } ───    │
    │                                  │ (process exits)
    │  cleanup()                       │
    │  (socket removed)                │
```

## Common Mistakes to Avoid

### 1. Creating server AFTER spawning canvas

```typescript
// WRONG - canvas can't connect because server doesn't exist yet
await spawnCanvas(...);
await createControllerServer(...);  // Too late!

// CORRECT - server exists before canvas tries to connect
const promise = createControllerServer(...);
await new Promise(r => setTimeout(r, 100));  // Let server start
await spawnCanvas(...);
await promise;
```

### 2. Canvas creating a server instead of connecting as client

```typescript
// WRONG - canvas should not create server
const server = await createIPCServer({ socketPath, ... });

// CORRECT - canvas connects as client
const client = await connectWithRetry({ socketPath, ... });
```

### 3. Not sending "ready" message after connecting

```typescript
// WRONG - controller never knows canvas is ready
const client = await connectWithRetry(...);
// missing: client.send({ type: "ready", scenario });

// CORRECT - send ready immediately after connecting
const client = await connectWithRetry(...);
client.send({ type: "ready", scenario });
```

### 4. Using JSX syntax in OpenTUI render (CRITICAL)

```typescript
// WRONG - JSX defers component execution, hooks don't run synchronously
render(() => <MyComponent {...props} />, { useThread: false });

// CORRECT - Direct call ensures hooks execute immediately
render(() => MyComponent(props), { useThread: false });
```

### 5. Using onMount for IPC connection in OpenTUI

```typescript
// WRONG - onMount doesn't fire reliably in OpenTUI
onMount(() => {
  connectWithRetry(...);  // Never runs!
});

// CORRECT - Connect immediately when hook is called
if (socketPath) {
  (async () => {
    await connectWithRetry(...);
  })();
}
```

## Testing the Pattern

Create a simple test script to verify IPC works:

```typescript
// test-ipc.ts
import { createControllerServer } from "./packages/core/src/ipc/server";
import { connectWithRetry } from "./packages/core/src/ipc/client";

const socketPath = "/tmp/test-ipc.sock";

async function main() {
  // Create server (controller side)
  const server = await createControllerServer({
    socketPath,
    onMessage: (msg) => console.log("Server received:", msg),
    onClientConnect: () => console.log("Client connected!"),
  });

  // Connect as client (canvas side)
  const client = await connectWithRetry({
    socketPath,
    onMessage: (msg) => console.log("Client received:", msg),
    onDisconnect: () => console.log("Disconnected"),
  });

  // Send ready message
  client.send({ type: "ready", scenario: "test" });

  // Simulate selection
  setTimeout(() => {
    client.send({ type: "selected", data: { test: "data" } });
    client.close();
    server.close();
  }, 1000);
}

main();
```

Run with: `bun run test-ipc.ts`

## Source Reference

This architecture is based on the proven [Claude Canvas](https://github.com/dvdsgl/claude-canvas) implementation by @dvdsgl.
