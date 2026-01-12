# OpenCode Canvas Architecture

## Overview

OpenCode Canvas provides interactive terminal UIs that spawn in tmux split panes alongside OpenCode. It enables rich visual interactions for tasks like scheduling, document editing, and booking flows.

```
┌─────────────────────────────────────────────────────────────────┐
│                        tmux session                              │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │                      │  │                                  │ │
│  │     OpenCode         │  │        Canvas (Ink/React)        │ │
│  │                      │  │                                  │ │
│  │  - AI conversation   │  │  - Calendar view                 │ │
│  │  - Tool execution    │  │  - Document editor               │ │
│  │  - File operations   │  │  - Flight booking                │ │
│  │                      │  │                                  │ │
│  │         ◄────────────┼──┼─► Unix Socket IPC                │ │
│  │                      │  │                                  │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
│        ~33% width              ~67% width                        │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. CLI (`canvas/src/cli.ts`)

Entry point for all canvas operations.

**Commands**:
- `show <kind>` - Render canvas in current terminal
- `spawn <kind>` - Open canvas in tmux split pane
- `env` - Show terminal environment info
- `update <id>` - Send config update to running canvas
- `selection <id>` - Get text selection from document canvas
- `content <id>` - Get content from document canvas

### 2. Terminal Manager (`canvas/src/terminal.ts`)

Handles tmux detection and pane management with **scoped isolation**.

**Key Features**:
- Detects if running inside tmux
- Creates split panes (67% width for canvas)
- **Scoped pane tracking** - Each OpenCode instance gets isolated pane management
- **Ownership tagging** - Panes tagged with `@canvas-owner` to prevent cross-session interference
- Uses `remain-on-exit` + `respawn-pane` for reliable pane reuse

**Pane Scoping**:
```
Scope = SHA256(TMUX_env + TMUX_PANE + cwd).slice(0,12)
File  = /tmp/opencode-canvas-{scope}.pane
Tag   = @canvas-owner = {scope}
```

This ensures multiple OpenCode instances (different sessions, projects, or terminals) never interfere with each other's canvas panes.

### 3. IPC System (`canvas/src/ipc/`)

Bidirectional communication via Unix domain sockets.

**Socket Path**: `/tmp/canvas-{id}.sock`

**Message Flow**:
```
Canvas                              Controller (OpenCode)
   │                                       │
   │──── { type: "ready" } ───────────────►│
   │                                       │
   │◄─── { type: "update", config } ───────│
   │                                       │
   │──── { type: "selected", data } ──────►│
   │                                       │
   │◄─── { type: "close" } ────────────────│
   │                                       │
```

### 4. Canvas Components (`canvas/src/canvases/`)

React/Ink components for each canvas type.

| Canvas | File | Scenarios |
|--------|------|-----------|
| Calendar | `calendar.tsx` | display, meeting-picker |
| Document | `document.tsx` | display, edit, email-preview |
| Flight | `flight.tsx` | booking |

### 5. OpenCode Integration (`.opencode/`)

```
.opencode/
├── package.json          # Dependencies
├── tool/                 # Custom tools (loaded at startup)
│   ├── canvas-calendar.ts
│   ├── canvas-document.ts
│   └── canvas-flight.ts
├── command/              # Slash commands
│   └── canvas.md
└── skill/                # AI guidance
    ├── canvas.md
    ├── calendar.md
    ├── document.md
    └── flight.md
```

## Data Flow

### Spawning a Canvas

```
1. User asks OpenCode to show calendar
2. OpenCode calls canvas-calendar tool
3. Tool runs: bun canvas/src/cli.ts spawn calendar
4. CLI computes scope hash from TMUX env + pane + cwd
5. Checks /tmp/opencode-canvas-{scope}.pane for existing pane
6. If pane exists AND @canvas-owner matches scope:
   - Use respawn-pane to restart canvas in same pane
   If not:
   - Create new tmux split-window
   - Set remain-on-exit option
   - Tag pane with @canvas-owner
7. Canvas renders in pane, creates IPC server
8. Tool returns success message to OpenCode
```

### User Interaction

```
1. User interacts with canvas (click, keyboard)
2. Canvas updates internal state
3. On selection/confirmation:
   - Canvas sends { type: "selected", data } via IPC
   - Canvas may auto-close or wait for more input
4. Controller receives selection data
5. OpenCode can use data in conversation
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.0.0 | UI framework (required by Ink 6.x) |
| ink | ^6.6.0 | React renderer for terminals |
| ink-spinner | ^5.0.0 | Loading spinners |
| commander | ^14.0.0 | CLI argument parsing |
| bun | runtime | JavaScript/TypeScript runtime |

## Requirements

- **tmux**: Required for split pane spawning
- **Bun**: Runtime for canvas execution
- **Terminal with mouse support**: For click interactions
- **macOS/Linux**: Native support
- **Windows**: Via WSL only
