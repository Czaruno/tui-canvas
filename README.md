# TUI Canvas

**Framework-agnostic interactive terminal canvases for AI coding assistants.**

Works with **OpenCode**, **Claude Code**, **Cursor**, **Gemini CLI**, **Grok CLI**, and any MCP-compatible AI harness.

Supports multiple TUI frameworks: **OpenTUI** (primary), **Ink**, and more.

## Features

- **Protocol-first design** - Any TUI framework can implement canvases
- **Multiple implementations** - Same canvas in OpenTUI, Ink, Bubbletea, etc.
- **MCP integration** - Works with any AI coding assistant via MCP
- **tmux integration** - Canvases spawn in split panes

### Built-in Canvases

- **Calendar** - Weekly view with events, meeting time picker
- **Document** - Markdown viewer/editor with text selection
- **Flight** - Cyberpunk-themed flight booking with seatmaps

## Quick Start

### Install

```bash
# Run without installing globally
bunx tui-canvas list
```

### MCP Configuration

**OpenCode (`opencode.json` in this repo):**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tui-canvas": {
      "type": "local",
      "command": ["bun", "run", "packages/mcp/src/index.ts"],
      "enabled": true
    }
  }
}
```

**Other MCP clients:**

```json
{
  "mcpServers": {
    "tui-canvas": {
      "command": "bunx",
      "args": ["tui-canvas"]
    }
  }
}
```

### CLI Usage

```bash
# List available canvases
bunx tui-canvas list

# Spawn a canvas (must be in tmux)
bunx tui-canvas spawn calendar --scenario display
bunx tui-canvas spawn document --scenario edit --config '{"content": "# Hello"}'

# Use specific implementation
bunx tui-canvas spawn calendar --implementation ink
bunx tui-canvas spawn calendar --implementation opentui
```

## Project Structure

```
tui-canvas/
├── packages/
│   ├── protocol/         # Protocol specification & types
│   ├── cli/              # Unified CLI
│   ├── mcp/              # MCP server
│   └── runtime/          # Framework adapters
│       ├── opentui/      # OpenTUI runtime (primary)
│       └── ink/          # Ink runtime
│
├── canvases/             # Canvas implementations
│   ├── calendar/
│   │   ├── manifest.json # Canvas manifest
│   │   ├── opentui/      # OpenTUI implementation
│   │   └── ink/          # Ink implementation
│   ├── document/
│   └── flight/
```

## Supported Frameworks

| Framework | Status | Description |
|-----------|--------|-------------|
| **OpenTUI** | Primary | TypeScript TUI framework (anomalyco/opentui) |
| **Ink** | Secondary | React for terminals |
| Bubbletea | Planned | Go TUI framework |
| Textual | Planned | Python TUI framework |

## Supported AI Harnesses

| Harness | Detection |
|---------|-----------|
| OpenCode | `OPENCODE` env |
| Claude Code | `CLAUDE_CODE` env |
| Cursor | `CURSOR_SESSION` env |
| Gemini CLI | `GEMINI_CLI` / `GEMINI_API_KEY` env |
| Grok CLI | `GROK_CLI` / `XAI_API_KEY` env |
| Generic | Fallback for any MCP client |

## Creating Canvases

### Canvas Manifest

Each canvas has a `manifest.json`:

```json
{
  "id": "my-canvas",
  "name": "My Canvas",
  "description": "A custom canvas",
  "version": "1.0.0",
  
  "scenarios": {
    "default": {
      "description": "Default scenario",
      "configSchema": { ... },
      "resultSchema": { ... }
    }
  },
  
  "implementations": {
    "opentui": {
      "framework": "opentui",
      "reconciler": "solid",
      "entrypoint": "./opentui/index.ts"
    },
    "ink": {
      "framework": "ink",
      "entrypoint": "./ink/index.tsx"
    }
  },
  
  "defaultImplementation": "opentui"
}
```

### Protocol

Canvases communicate via Unix sockets using the TUI Canvas Protocol:

**Canvas → Controller:**
```typescript
{ type: "ready", scenario: string }
{ type: "selected", data: unknown }
{ type: "cancelled", reason?: string }
```

**Controller → Canvas:**
```typescript
{ type: "update", config: unknown }
{ type: "close" }
```

## Development

```bash
# Clone and install
git clone https://github.com/anomalyco/tui-canvas.git
cd tui-canvas
bun install

# Test CLI
bun run packages/cli/src/index.ts list
bun run packages/cli/src/index.ts spawn calendar

# Start MCP server
bun run packages/mcp/src/index.ts
```

## Requirements

- [Bun](https://bun.sh) runtime
- [tmux](https://github.com/tmux/tmux) for pane spawning
- Terminal with mouse support (recommended)

## License

MIT

## Credits

Originally based on [Claude Canvas](https://github.com/dvdsgl/claude-canvas).
OpenTUI framework: [github.com/anomalyco/opentui](https://github.com/anomalyco/opentui)
