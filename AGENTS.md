# TUI Canvas - Development Guidelines

## Overview

TUI Canvas is a universal MCP server that provides interactive terminal canvases for AI coding assistants. It works with OpenCode, Claude Code, Cursor, Gemini CLI, Grok CLI, and any MCP-compatible harness.

**Key Feature**: MCP tools support `waitForResult` parameter to wait for user selections and return results via IPC.

## Project Structure

```
tui-canvas/
├── packages/
│   ├── core/                 # TUI canvas components (Ink/React)
│   │   ├── src/
│   │   │   ├── ipc/          # Unix socket IPC
│   │   │   │   ├── server.ts # Controller server + Canvas server
│   │   │   │   ├── client.ts # Canvas client (connects to controller)
│   │   │   │   └── types.ts  # Message types
│   │   │   ├── api/          # High-level canvas APIs
│   │   │   ├── scenarios/    # Scenario type definitions
│   │   │   └── canvases/     # Canvas components
│   │   │       ├── calendar.tsx
│   │   │       ├── document.tsx
│   │   │       └── flight.tsx
│   │
│   ├── cli/                  # Unified CLI
│   │   └── src/
│   │       ├── index.ts      # Commands: list, info, spawn, env, cleanup, status
│   │       ├── registry.ts   # Canvas discovery from manifests
│   │       └── spawn.ts      # Scoped pane isolation + spawning
│   │
│   ├── mcp/                  # MCP server (universal entry point)
│   │   └── src/
│   │       ├── index.ts      # MCP server with IPC support
│   │       ├── detect.ts     # Harness detection
│   │       └── tools.ts      # MCP tool definitions
│   │
│   └── protocol/             # Canvas protocol types
│
├── canvases/                 # Canvas implementations
│   ├── calendar/
│   ├── document/
│   └── flight/
│
├── .opencode/skill/          # Agent skills
│   ├── canvas/SKILL.md
│   ├── calendar/SKILL.md
│   ├── document/SKILL.md
│   └── flight/SKILL.md
│
├── docs/
│   ├── feature-parity.md
│   ├── architecture/
│   │   └── ipc-protocol.md
│   └── sessions/
│
└── opencode.json             # MCP configuration
```

## Key Technologies

- **Bun**: Runtime and package manager
- **Ink**: React for terminal UIs
- **tmux**: Terminal multiplexer for split panes
- **MCP SDK**: Model Context Protocol server
- **Unix domain sockets**: IPC between harness and canvases

## Supported Harnesses

| Harness | Detection Method |
|---------|------------------|
| OpenCode | `OPENCODE` or `OPENCODE_SESSION` env |
| Claude Code | `CLAUDE_CODE` or `ANTHROPIC_API_KEY` env |
| Cursor | `CURSOR_SESSION` or `CURSOR_TRACE_ID` env |
| Codex | `CODEX_SESSION` env |
| Gemini CLI | `GEMINI_CLI` or `GEMINI_API_KEY` env |
| Grok CLI | `GROK_CLI` or `XAI_API_KEY` env |
| Generic | Fallback for any MCP client |

## Canvas Types

### Calendar
- Display weekly calendar with events
- Meeting picker for finding available times
- Keyboard and mouse navigation

### Document
- Markdown rendering with syntax highlighting
- Text selection and editing
- Email preview mode

### Flight
- Cyberpunk-themed flight comparison
- Interactive seatmap selection
- Keyboard/mouse navigation

## IPC Protocol

Canvases communicate via Unix sockets at `/tmp/canvas-{id}.sock`.

**Architecture**: Controller (MCP server) creates the socket server, Canvas connects as a client.

**Canvas to Controller:**
- `{ type: "ready", scenario: string }`
- `{ type: "selected", data: unknown }`
- `{ type: "cancelled", reason?: string }`
- `{ type: "error", message: string }`

**Controller to Canvas:**
- `{ type: "update", config: unknown }`
- `{ type: "close" }`
- `{ type: "getSelection" }`
- `{ type: "getContent" }`

## Running Locally

```bash
# Install dependencies
bun install

# Test core CLI (must be in tmux)
bun run packages/cli/src/index.ts env
bun run packages/cli/src/index.ts show calendar

# Spawn canvas in split pane
bun run packages/cli/src/index.ts spawn document --scenario edit --config '{"content": "# Test"}'

# Check canvas pane status
bun run packages/cli/src/index.ts status

# Cleanup orphaned panes
bun run packages/cli/src/index.ts cleanup --dry-run

# Start MCP server
bun run packages/mcp/src/index.ts
```

## MCP Configuration

Add to your AI harness MCP config:

```json
{
  "mcpServers": {
    "opentui-canvas": {
      "command": "bunx",
      "args": ["opentui-canvas"]
    }
  }
}
```

For local development:

```json
{
  "mcpServers": {
    "opentui-canvas": {
      "command": "bun",
      "args": ["run", "/path/to/opentui-canvas/packages/mcp/src/index.ts"]
    }
  }
}
```

## MCP Tools

- `canvas_calendar` - Calendar display and meeting picker
- `canvas_document` - Document view/edit/email-preview
- `canvas_flight` - Flight booking with seat selection

## Scoped Pane Isolation

Each OpenCode instance gets its own canvas pane scope based on:
- TMUX environment (socket, server PID, session)
- TMUX_PANE (the pane where the AI runs)
- Current working directory

This prevents multiple AI sessions from interfering with each other's canvases.

Pane tracking files: `/tmp/opencode-canvas-{hash}.pane`

## Requirements

- tmux session (required for spawning)
- Terminal with mouse support
- Bun runtime
