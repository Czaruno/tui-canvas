# Development Guide

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [tmux](https://github.com/tmux/tmux)
- Terminal with mouse support (iTerm2, Alacritty, etc.)

## Setup

```bash
# Clone repository
git clone https://github.com/your-username/opencode-canvas.git
cd opencode-canvas

# Install dependencies
bun install

# Verify setup
bun run canvas/src/cli.ts env
```

## Development Workflow

### Running Canvases

```bash
# Show in current terminal (for development)
bun run canvas/src/cli.ts show calendar

# Spawn in split pane (production behavior)
bun run canvas/src/cli.ts spawn calendar

# With hot reload
bun --watch run canvas/src/cli.ts show document --config '{"content": "# Test"}'
```

### Project Structure

```
canvas/
├── src/
│   ├── cli.ts              # CLI entry - add new commands here
│   ├── terminal.ts         # tmux logic - modify spawn behavior
│   ├── ipc/
│   │   ├── types.ts        # Message type definitions
│   │   ├── server.ts       # Canvas-side IPC (Bun.listen)
│   │   └── client.ts       # Controller-side IPC (Bun.connect)
│   ├── scenarios/
│   │   └── types.ts        # Scenario configs and results
│   ├── api/
│   │   ├── index.ts        # High-level API exports
│   │   └── canvas-api.ts   # Programmatic canvas spawning
│   └── canvases/
│       ├── index.tsx       # Canvas router
│       ├── calendar.tsx    # Calendar component
│       ├── calendar/       # Calendar subcomponents
│       ├── document.tsx    # Document component
│       ├── document/       # Document subcomponents
│       ├── flight.tsx      # Flight component
│       └── flight/         # Flight subcomponents
└── run-canvas.sh           # Shell wrapper
```

## Adding a New Canvas Type

### 1. Create Component

```tsx
// canvas/src/canvases/mycanvas.tsx
import React from "react";
import { Box, Text, useInput, useApp } from "ink";

interface Props {
  id: string;
  config?: MyCanvasConfig;
  socketPath?: string;
  scenario?: string;
}

export function MyCanvas({ id, config, socketPath, scenario }: Props) {
  const { exit } = useApp();
  
  useInput((input, key) => {
    if (key.escape) exit();
  });

  return (
    <Box>
      <Text>My Canvas: {id}</Text>
    </Box>
  );
}
```

### 2. Add to Router

```tsx
// canvas/src/canvases/index.tsx
import { MyCanvas } from "./mycanvas";

export async function renderCanvas(kind, id, config, options) {
  switch (kind) {
    // ... existing cases
    case "mycanvas":
      return renderMyCanvas(id, config, options);
  }
}
```

### 3. Add Types

```ts
// canvas/src/scenarios/types.ts
export interface MyCanvasConfig {
  // config fields
}

export interface MyCanvasResult {
  // result fields
}
```

### 4. Create OpenCode Tool

```ts
// .opencode/tool/canvas-mycanvas.ts
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Spawn my canvas",
  args: {
    config: tool.schema.string().optional(),
  },
  async execute(args) {
    const id = `mycanvas-${Date.now()}`
    await Bun.$`bun run canvas/src/cli.ts spawn mycanvas --id ${id}`.text()
    return `Spawned mycanvas '${id}'`
  },
})
```

### 5. Add Skill

```markdown
<!-- .opencode/skill/mycanvas.md -->
---
name: mycanvas
description: My canvas skill
---

# My Canvas

Configuration and usage documentation...
```

## Testing

### Manual Testing

```bash
# Test each canvas type
bun run canvas/src/cli.ts show calendar
bun run canvas/src/cli.ts show document --config '{"content": "# Test"}'
bun run canvas/src/cli.ts show flight --config '{"flights": []}'

# Test spawning
bun run canvas/src/cli.ts spawn calendar

# Test IPC
bun run canvas/src/cli.ts spawn document --scenario edit --id test-doc
# In another terminal:
bun run canvas/src/cli.ts selection test-doc
```

### Debugging

```bash
# Check tmux pane tracking (scoped by session/pane/cwd)
ls -la /tmp/opencode-canvas-*.pane
cat /tmp/opencode-canvas-*.pane

# Check pane ownership tag
tmux show-options -p -t $(cat /tmp/opencode-canvas-*.pane) @canvas-owner

# Check socket exists
ls -la /tmp/canvas-*.sock

# Verbose spawn
DEBUG=1 bun run canvas/src/cli.ts spawn calendar

# View scope hash for current environment
bun -e "import { getCanvasScope } from './canvas/src/terminal.ts'; console.log(getCanvasScope())"
```

## Common Issues

### React Version Mismatch
```
TypeError: undefined is not an object (evaluating 'ReactSharedInternals.S')
```
**Fix**: Ensure `react@^19.0.0` in package.json, run `bun install`

### Canvas Closes Immediately
- Check for runtime errors: `bun run canvas/src/cli.ts show calendar`
- Look for import errors or missing dependencies

### tmux Split Not Working
- Verify in tmux: `echo $TMUX`
- Check pane file: `ls /tmp/opencode-canvas-*.pane`
- Check ownership: `tmux show-options -p -t <pane-id> @canvas-owner`
- Manual test: `tmux split-window -h "echo test; sleep 5"`

### Canvas Interfering with Other tmux Panes
Canvas panes are now **scoped** by session + pane + working directory. If you see interference:
- Delete stale pane files: `rm /tmp/opencode-canvas-*.pane`
- Check pane ownership tags match your scope
- Each OpenCode instance (in different terminals/sessions/projects) should have a unique scope hash

## Code Style

- TypeScript strict mode
- React functional components with hooks
- Ink for terminal UI
- Bun for runtime and shell commands
