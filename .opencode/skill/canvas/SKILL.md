---
name: canvas
description: |
  Primary skill for terminal TUI canvases. Use when displaying calendars, documents, or flight bookings in interactive terminal interfaces.
---

# Canvas TUI Toolkit

**Start here when using terminal canvases.** This skill covers the overall workflow, canvas types, and when to use each one.

## When to Use Canvases

Use canvases when users need to:
- View or interact with structured data visually
- Make selections from calendars, documents, or flight options
- See information that benefits from a dedicated display

## Available Canvas Types

| Canvas | MCP Tool | Purpose | Scenarios |
|--------|----------|---------|-----------|
| Calendar | `canvas_calendar` | Display calendars, pick meeting times | `display`, `meeting-picker` |
| Document | `canvas_document` | View/edit markdown documents | `display`, `edit`, `email-preview` |
| Flight | `canvas_flight` | Flight comparison and seat selection | `booking` |

## Example Prompts

**Calendar:**
- "Show me my calendar for this week"
- "Find a time when Alice and Bob are both free"
- "Schedule a 30-minute meeting next Tuesday"

**Document:**
- "Draft an email to the sales team about the new feature"
- "Show me this README so I can review it"
- "Help me edit this document"

**Flight:**
- "Find flights from SFO to Denver next Friday"
- "Book me a window seat on the morning flight"
- "Compare United flights to Boston under $300"

## Quick Reference

### Calendar Canvas
```
canvas_calendar(scenario: "display" | "meeting-picker", config?: string)
```

### Document Canvas
```
canvas_document(content: string, scenario?: "display" | "edit" | "email-preview", title?: string)
```

### Flight Canvas
```
canvas_flight(config: string)  // JSON with flights array
```

## Requirements

- **tmux session**: Canvases spawn in tmux split panes
- **Terminal with mouse support**: For click-based interactions

## Pane Behavior

- All canvases spawn in a dedicated split pane
- The same pane is reused for subsequent canvas spawns
- Press `q` or `Esc` to close a canvas

## Related Skills

| Skill | Purpose |
|-------|---------|
| `calendar` | Calendar display and meeting picker details |
| `document` | Document rendering and text selection |
| `flight` | Flight comparison and seat map details |
