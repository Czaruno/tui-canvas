# CLI Reference

## Usage

```bash
bun run canvas/src/cli.ts <command> [options]
```

Or using the wrapper script:

```bash
./canvas/run-canvas.sh <command> [options]
```

---

## Commands

### show

Render a canvas in the current terminal.

```bash
bun run canvas/src/cli.ts show <kind> [options]
```

**Arguments**:
- `kind` - Canvas type: `calendar`, `document`, `flight`, `demo`

**Options**:
- `--id <id>` - Canvas instance ID
- `--config <json>` - JSON configuration
- `--socket <path>` - Unix socket path for IPC
- `--scenario <name>` - Scenario mode

**Examples**:
```bash
# Show demo calendar
bun run canvas/src/cli.ts show calendar

# Show document with content
bun run canvas/src/cli.ts show document --config '{"content": "# Hello"}'

# Show meeting picker
bun run canvas/src/cli.ts show calendar --scenario meeting-picker --config '{"calendars": []}'
```

---

### spawn

Open a canvas in a new tmux split pane.

```bash
bun run canvas/src/cli.ts spawn <kind> [options]
```

**Arguments**:
- `kind` - Canvas type: `calendar`, `document`, `flight`

**Options**:
- `--id <id>` - Canvas instance ID (auto-generated if not provided)
- `--config <json>` - JSON configuration
- `--socket <path>` - Unix socket path for IPC
- `--scenario <name>` - Scenario mode

**Behavior**:
- Creates a vertical split (canvas on right, 67% width)
- Reuses existing canvas pane if one exists
- Returns immediately after spawning

**Examples**:
```bash
# Spawn calendar
bun run canvas/src/cli.ts spawn calendar

# Spawn document editor
bun run canvas/src/cli.ts spawn document --scenario edit --config '{"content": "# Edit me"}'

# Spawn with custom ID
bun run canvas/src/cli.ts spawn calendar --id my-calendar
```

---

### env

Display terminal environment information.

```bash
bun run canvas/src/cli.ts env
```

**Output**:
```
Terminal Environment:
  In tmux: true

Summary: tmux
```

---

### update

Send updated configuration to a running canvas.

```bash
bun run canvas/src/cli.ts update <id> --config <json>
```

**Arguments**:
- `id` - Canvas instance ID

**Options**:
- `--config <json>` - New JSON configuration

**Example**:
```bash
bun run canvas/src/cli.ts update my-doc --config '{"content": "# Updated content"}'
```

---

### selection

Get the current text selection from a document canvas.

```bash
bun run canvas/src/cli.ts selection <id>
```

**Arguments**:
- `id` - Document canvas instance ID

**Output**:
```json
{"selectedText":"Hello","startOffset":0,"endOffset":5}
```

Returns `null` if no selection.

---

### content

Get the current content from a document canvas.

```bash
bun run canvas/src/cli.ts content <id>
```

**Arguments**:
- `id` - Document canvas instance ID

**Output**:
```json
{"content":"# Full document...","cursorPosition":42}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TMUX` | Set by tmux; used to detect if running in tmux session |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (unknown canvas type, not in tmux, etc.) |

---

## Temp Files

| Path | Purpose |
|------|---------|
| `/tmp/canvas-{id}.sock` | Unix socket for IPC |
| `/tmp/canvas-config-{id}.json` | Temporary config storage |
| `/tmp/opencode-canvas-pane-id` | Tracks current canvas tmux pane |
