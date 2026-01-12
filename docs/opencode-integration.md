# OpenCode Integration

This document describes how OpenCode Canvas integrates with OpenCode.

## Directory Structure

```
.opencode/
├── package.json              # Dependencies
├── tool/                     # Custom tools
│   ├── canvas-calendar.ts
│   ├── canvas-document.ts
│   └── canvas-flight.ts
├── command/                  # Slash commands
│   └── canvas.md
└── skill/                    # AI guidance
    ├── canvas.md
    ├── calendar.md
    ├── document.md
    └── flight.md
```

## Custom Tools

OpenCode loads tools from `.opencode/tool/` at startup.

### canvas-calendar

Spawns a calendar canvas.

**Arguments**:
- `scenario`: `"display"` | `"meeting-picker"` (default: `"display"`)
- `config`: Optional JSON string with events/calendars

**Example usage by AI**:
```
I'll spawn a calendar to show your schedule.
[calls canvas-calendar with scenario="display"]
```

### canvas-document

Spawns a document canvas.

**Arguments**:
- `scenario`: `"display"` | `"edit"` | `"email-preview"` (default: `"display"`)
- `content`: Markdown content string
- `title`: Optional document title

**Example usage by AI**:
```
Let me show you this document so you can select text to edit.
[calls canvas-document with scenario="edit", content="# Draft\n\nSelect what to change"]
```

### canvas-flight

Spawns a flight booking canvas.

**Arguments**:
- `config`: JSON string with flights array

**Example usage by AI**:
```
Here are the available flights. Select one and choose your seat.
[calls canvas-flight with config="{flights: [...]}"]
```

## Slash Command

The `/canvas` command is defined in `.opencode/command/canvas.md`.

When user types `/canvas`, OpenCode:
1. Reads the command definition
2. Follows the workflow to determine canvas type
3. Gathers configuration from user
4. Calls the appropriate tool

## Skills

Skills provide AI guidance for using canvases effectively.

### canvas.md (Main Skill)
- Overview of all canvas types
- When to use each canvas
- General workflow

### calendar.md
- Calendar display configuration
- Meeting picker usage
- Event format

### document.md  
- Markdown rendering
- Text selection
- Email preview format

### flight.md
- Flight data structure
- Seatmap configuration
- Booking flow

## Loading Order

1. OpenCode starts
2. Reads `.opencode/package.json`, installs dependencies
3. Loads tools from `.opencode/tool/`
4. Loads commands from `.opencode/command/`
5. Skills are loaded on-demand when relevant

## Restart Required

Changes to `.opencode/` require restarting OpenCode to take effect.

## Testing Integration

After restarting OpenCode:

1. **Test tool availability**:
   - Ask: "What tools do you have for displaying calendars?"
   - OpenCode should mention `canvas-calendar`

2. **Test tool execution**:
   - Ask: "Show me a calendar"
   - OpenCode should call `canvas-calendar`
   - Canvas should spawn in tmux split

3. **Test slash command**:
   - Type `/canvas`
   - OpenCode should guide you through canvas selection

## Troubleshooting

### Tools not loading
- Ensure OpenCode was restarted after creating files
- Check `.opencode/package.json` has `@opencode-ai/plugin`
- Check for syntax errors in tool files

### Canvas spawns but closes
- Ensure React 19 in `package.json` (not React 18)
- Run `bun install` to update dependencies

### "Not in tmux" error
- OpenCode and canvases must run inside tmux
- Start tmux: `tmux new -s opencode`
