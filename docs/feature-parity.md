# Feature Parity: Claude Canvas vs TUI Canvas

**Last Updated**: January 12, 2026 (IPC Tested)

**Reference**: https://github.com/dvdsgl/claude-canvas

This document compares the original Claude Canvas with TUI Canvas.

---

## Summary

| Category | Claude Canvas | TUI Canvas | Status |
|----------|---------------|------------|--------|
| Canvas Types | 3 (calendar, document, flight) | 3 (calendar, document, flight) | Parity |
| CLI Commands | 5 (show, spawn, env, update, selection, content) | 6 (list, info, spawn, env, cleanup, status) | Parity+ |
| IPC Protocol | Unix sockets | Unix sockets | Parity |
| MCP Integration | No | **Yes** (universal MCP server) | Better |
| tmux Integration | Basic pane reuse | **Enhanced** with scoped isolation | Better |
| Plugin System | Claude Code plugins | MCP tools + OpenCode skills | Adapted |
| Skills/Commands | 4 skills + 1 command | 4 skills | Parity |

---

## Canvas Types

### Calendar Canvas

| Feature | Claude | TUI Canvas | Notes |
|---------|--------|----------|-------|
| Weekly view | Yes | Yes | |
| Event display | Yes | Yes | |
| Current time indicator | Yes | Yes | Red line showing current time |
| Keyboard navigation | Yes | Yes | Arrow keys, t for today |
| Demo events | Yes | Yes | Auto-generated if no config |
| **Scenarios** | | | |
| - display | Yes | Yes | Basic calendar view |
| - meeting-picker | Yes | Yes | Multi-calendar availability |

### Document Canvas

| Feature | Claude | TUI Canvas | Notes |
|---------|--------|----------|-------|
| Markdown rendering | Yes | Yes | |
| Text selection | Yes | ⚠️ Buggy | Mouse-based selection has issues |
| Edit mode | Yes | ⚠️ Buggy | Character input issues, Home/End broken |
| Email preview | No | **Yes** | Specialized email layout (TUI Canvas extra) |
| Diff highlighting | Yes | **No** | Code exists but not wired to renderer |
| **Scenarios** | | | |
| - display | Yes | Yes | Read-only view |
| - edit | Yes | ⚠️ Buggy | Has input handling bugs |
| - email-preview | No | **Yes** | TUI Canvas exclusive |

### Flight Canvas

| Feature | Claude | TUI Canvas | Notes |
|---------|--------|----------|-------|
| Flight comparison | Yes | Yes | Side-by-side flight cards |
| Seatmap selection | Yes | Yes | Interactive seat picker |
| Cyberpunk theme | Yes | Yes | Aesthetic styling |
| Keyboard/mouse nav | Yes | Yes | |
| Price display | Yes | Yes | |
| **Scenarios** | | | |
| - booking | Yes | Yes | Compare and book |

---

## CLI Commands

| Command | Claude | TUI Canvas | Notes |
|---------|--------|------------|-------|
| `show [kind]` | Yes | Via entry point | Render in current terminal |
| `spawn [kind]` | Yes | Yes | Open in tmux split pane |
| `env` | Yes | Yes | Show terminal environment |
| `update <id>` | Yes | Via IPC | Send config update via IPC |
| `selection <id>` | Yes | Via IPC | Get document selection |
| `content <id>` | Yes | Via IPC | Get document content |
| `list` | No | **Yes** | List available canvases |
| `info <canvas>` | No | **Yes** | Show canvas details |
| `cleanup` | No | **Yes** | Find/close orphaned panes |
| `status` | No | **Yes** | Show pane ownership |

---

## IPC Protocol

### Messages (Canvas -> Controller)

| Message | Claude | OpenCode | Notes |
|---------|--------|----------|-------|
| `ready` | Yes | Yes | Canvas initialized |
| `selected` | Yes | Yes | User made selection |
| `cancelled` | Yes | Yes | User cancelled |
| `error` | Yes | Yes | Error occurred |
| `pong` | Yes | Yes | Health check response |
| `selection` | Yes | Yes | Text selection data |
| `content` | Yes | Yes | Document content |

### Messages (Controller -> Canvas)

| Message | Claude | OpenCode | Notes |
|---------|--------|----------|-------|
| `update` | Yes | Yes | Update configuration |
| `close` | Yes | Yes | Request close |
| `ping` | Yes | Yes | Health check |
| `getSelection` | Yes | Yes | Request selection |
| `getContent` | Yes | Yes | Request content |

---

## tmux Integration

| Feature | Claude | TUI Canvas | Notes |
|---------|--------|----------|-------|
| Split pane spawn | Yes | Yes | 67% width for canvas |
| Pane reuse | Yes | Yes | Reuses existing canvas pane |
| Pane tracking | Global file | **Scoped file** | OpenCode uses hash-based scoping |
| Ownership verification | No | **Yes** | @canvas-owner tmux option |
| Cross-session isolation | No | **Yes** | Prevents interference |
| remain-on-exit | No | **Yes** | Keeps pane alive for respawn |

**TUI Canvas Enhancement**: Scoped pane isolation prevents conflicts when multiple tmux sessions run different TUIs.

---

## Plugin/Tool System

### Claude Canvas (Claude Code Plugins)

```
canvas/
├── skills/
│   ├── calendar/SKILL.md
│   ├── canvas/SKILL.md
│   ├── document/SKILL.md
│   └── flight/SKILL.md
├── commands/
│   └── canvas.md
└── package.json (with plugin config)
```

### TUI Canvas (MCP + OpenCode Skills)

```
packages/mcp/src/          # Universal MCP server
├── index.ts               # MCP server with IPC support
├── tools.ts               # Tool definitions
└── detect.ts              # Harness detection

.opencode/skill/           # OpenCode Agent Skills
├── canvas/SKILL.md        # Main canvas skill
├── calendar/SKILL.md      # Calendar skill
├── document/SKILL.md      # Document skill
└── flight/SKILL.md        # Flight skill
```

| Feature | Claude | TUI Canvas | Notes |
|---------|--------|------------|-------|
| MCP Server | No | **Yes** | Universal, works with any harness |
| Tools | Claude plugins | MCP tools | `canvas_calendar`, `canvas_document`, `canvas_flight` |
| Skills | 4 SKILL.md files | 4 SKILL.md files | Ported to `.opencode/skill/` |
| Commands | 1 command | Via skills | Skills guide usage |
| High-level API | Yes | Yes | `waitForResult` param on MCP tools |
| Harness Detection | Claude only | **Multi-harness** | OpenCode, Claude, Cursor, Gemini, Grok |

---

## Feature Parity Status: NEARLY COMPLETE

Most features are at parity, with two gaps remaining:

### Implemented

1. **High-Level API** (`canvas/src/api/canvas-api.ts`)
   - `spawnCanvasWithIPC()` - Generic spawn + wait
   - `pickMeetingTime()` - Calendar meeting picker
   - `displayCalendar()` - Calendar display
   - `editDocument()` - Document with selection
   - `displayDocument()` - Document display
   - `previewEmail()` - Email preview
   - `bookFlight()` - Flight booking with seat selection
   - `displayFlights()` - Flight comparison

2. **Controller Server** (`canvas/src/ipc/server.ts`)
   - `createControllerServer()` - For high-level API to receive canvas messages

3. **CLI spawn-wait command** (`canvas/src/cli.ts`)
   - `spawn-wait [kind]` - Spawn and wait for result, returns JSON

4. **Skills Documentation** (`.opencode/skill/`)
   - `canvas.md` - Overview and workflow
   - `calendar.md` - Calendar configuration
   - `document.md` - Document scenarios
   - `flight.md` - Flight booking

5. **Tool IPC Integration** (`.opencode/tool/*.ts`)
   - All tools now have `waitForResult` parameter
   - When true, waits for user selection and returns result

### Better in TUI Canvas

1. **Universal MCP Server**
   - Works with any MCP-compatible AI harness
   - Detects OpenCode, Claude Code, Cursor, Gemini CLI, Grok CLI
   - Single integration point for all tools

2. **Scoped Pane Isolation**
   - Prevents cross-session interference
   - Uses deterministic hashing for scope identification
   - Ownership verification via tmux pane options

3. **Pane Lifecycle Management**
   - Uses `remain-on-exit` for robust pane reuse
   - Uses `respawn-pane` instead of Ctrl+C hacks

4. **IPC via MCP Tools**
   - `waitForResult` parameter for interactive scenarios
   - `timeout` parameter with 5-minute default
   - Proper controller-side socket server architecture

---

## Remaining Gaps

| Feature | Status | Notes |
|---------|--------|-------|
| Document diff highlighting | **Missing** | Code exists in `markdown-renderer.tsx` but `raw-markdown-renderer.tsx` doesn't use it |
| Document edit mode | **Buggy** | Character input filtering too aggressive, Home/End keys broken, frame jumping |

### Potential Fixes

1. **Diff highlighting**: Wire up `DocumentDiff` support in `raw-markdown-renderer.tsx` or switch document canvas to use `markdown-renderer.tsx`

2. **Edit mode**: Consider using a library like `terminal-kit` TextBuffer for proper editing, or simplify to selection-only (matching Claude Canvas behavior)

---

## Conclusion

**TUI Canvas has NEAR feature parity** with Claude Canvas, plus enhancements:

| Feature | Status |
|---------|--------|
| Canvas Types (3) | Complete |
| Calendar Canvas | **Complete** |
| Document Canvas | ⚠️ Display works, edit buggy, diffs missing |
| Flight Canvas | **Complete** |
| CLI Commands | Complete + extras |
| IPC Protocol | **Complete** (tested all canvases) |
| MCP Integration | **Better** (universal server) |
| Skills Documentation | Complete |
| Tool IPC Integration | Complete (`waitForResult`) |
| tmux Integration | **Better** (scoped isolation) |
| Multi-Harness Support | **Better** (OpenCode, Claude, Cursor, Gemini, Grok) |

The port is nearly complete with two document canvas features needing work.
