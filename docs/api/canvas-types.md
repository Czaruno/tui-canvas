# Canvas Types & Configuration

## Calendar Canvas

### Scenarios

#### display

Read-only weekly calendar view.

```json
{
  "title": "My Calendar",
  "events": [
    {
      "id": "1",
      "title": "Team Standup",
      "startTime": "2026-01-15T09:00:00",
      "endTime": "2026-01-15T09:30:00",
      "color": "yellow",
      "allDay": false
    }
  ]
}
```

**Event Colors**: `yellow`, `green`, `blue`, `magenta`, `red`, `cyan`

**Controls**:
- `←/→` - Navigate weeks
- `t` - Jump to today
- `q/Esc` - Quit

#### meeting-picker

Interactive time slot selection.

```json
{
  "calendars": [
    {
      "name": "Alice",
      "color": "blue",
      "events": [
        {
          "id": "1",
          "title": "Busy",
          "startTime": "2026-01-15T10:00:00",
          "endTime": "2026-01-15T11:00:00"
        }
      ]
    },
    {
      "name": "Bob", 
      "color": "green",
      "events": []
    }
  ],
  "slotGranularity": 30,
  "minDuration": 30,
  "maxDuration": 120,
  "title": "Find Meeting Time"
}
```

**Result**:
```json
{
  "startTime": "2026-01-15T14:00:00.000Z",
  "endTime": "2026-01-15T14:30:00.000Z",
  "duration": 30
}
```

**Controls**:
- `↑↓←→` - Navigate time slots
- `Space/Enter` - Select slot (starts 3s countdown)
- `Shift+Enter` - Select immediately (skip countdown)
- `n/p` - Navigate weeks
- `Esc` - Cancel (during countdown: cancels selection)

---

## Document Canvas

### Scenarios

#### display

Read-only markdown viewing.

```json
{
  "content": "# Hello World\n\nThis is **markdown** content.",
  "title": "My Document"
}
```

**Controls**:
- `↑↓/PageUp/PageDown` - Scroll
- `Esc` - Quit

#### edit

Text selection and editing with mouse support.

```json
{
  "content": "# Editable Document\n\nClick and drag to select text.",
  "title": "Editor"
}
```

**Result** (on selection):
```json
{
  "selectedText": "selected content",
  "startOffset": 10,
  "endOffset": 25,
  "startLine": 1,
  "endLine": 1,
  "startColumn": 5,
  "endColumn": 20
}
```

**Controls**:
- Click and drag - Select text
- Arrow keys - Move cursor
- Type - Insert text
- Backspace - Delete
- Enter - New line
- `Esc` - Clear selection / Quit

#### email-preview

Email-formatted document view.

```json
{
  "content": "Hello,\n\nThis is the email body...",
  "from": "alice@example.com",
  "to": ["bob@example.com"],
  "cc": ["carol@example.com"],
  "bcc": ["dave@example.com"],
  "subject": "Meeting Follow-up"
}
```

**Controls**:
- `↑↓` - Scroll
- `Esc` - Quit

---

## Flight Canvas

### Scenarios

#### booking

Cyberpunk-themed flight comparison with seat selection.

```json
{
  "title": "Flight Search Results",
  "flights": [
    {
      "id": "UA123",
      "airline": "United",
      "flightNumber": "UA123",
      "origin": {
        "code": "SFO",
        "name": "San Francisco International",
        "city": "San Francisco"
      },
      "destination": {
        "code": "DEN",
        "name": "Denver International", 
        "city": "Denver"
      },
      "departure": "2026-01-15T08:00:00",
      "arrival": "2026-01-15T11:30:00",
      "duration": 210,
      "price": 299,
      "aircraft": "Boeing 737-800",
      "seatmap": {
        "rows": 30,
        "seatsPerRow": ["A", "B", "C", "D", "E", "F"],
        "aisleAfter": ["C"],
        "occupied": ["1A", "1B", "2A"],
        "unavailable": ["1C", "1D"],
        "premium": ["1A", "1B", "1C", "1D", "1E", "1F"]
      }
    }
  ]
}
```

**Result**:
```json
{
  "selectedFlight": { /* full flight object */ },
  "selectedSeat": "15A"
}
```

**Controls**:
- `↑↓` - Navigate flight list
- `Tab` - Switch between flights and seatmap
- `←→↑↓` (in seatmap) - Navigate seats
- `Space` - Toggle seat selection
- `Enter` - Confirm (starts 3s countdown)
- `Shift+Enter` - Confirm immediately
- `Esc` - Cancel

**Seat Colors**:
- Green - Available
- Red - Occupied
- Gray - Unavailable  
- Yellow - Premium/Extra legroom
- Cyan - Currently selected
