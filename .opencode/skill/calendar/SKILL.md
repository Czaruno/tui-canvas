---
name: calendar
description: |
  Calendar canvas for displaying events and picking meeting times. Use when showing calendar views or when users need to select available time slots.
---

# Calendar Canvas

Display calendar views and enable interactive meeting time selection.

## Example Prompts

- "Schedule a 30-minute meeting with Alice and Bob sometime next week"
- "Find a time when the engineering team is all free on Tuesday"
- "Show me my calendar for this week"
- "When is everyone available for a 1-hour planning session?"
- "Block off 2-4pm on Friday for focused work"

## Scenarios

### `display` (default)
View-only calendar display. Shows events in a weekly view.

```typescript
canvas_calendar({
  scenario: "display",
  config: JSON.stringify({
    title: "My Week",
    events: [
      {
        id: "1",
        title: "Team Standup",
        startTime: "2026-01-12T09:00:00",
        endTime: "2026-01-12T09:30:00",
        color: "blue"
      }
    ]
  })
})
```

### `meeting-picker`
Interactive scenario for selecting a free time slot across multiple calendars.

- Shows multiple calendars overlaid with different colors
- User can click on free slots to select a meeting time
- Supports configurable time slot granularity (15/30/60 min)

```typescript
canvas_calendar({
  scenario: "meeting-picker",
  config: JSON.stringify({
    calendars: [
      {
        name: "Alice",
        color: "blue",
        events: [
          { id: "1", title: "Standup", startTime: "2026-01-12T09:00:00", endTime: "2026-01-12T09:30:00" }
        ]
      },
      {
        name: "Bob",
        color: "green",
        events: [
          { id: "2", title: "Call", startTime: "2026-01-12T14:00:00", endTime: "2026-01-12T15:00:00" }
        ]
      }
    ],
    slotGranularity: 30,
    minDuration: 30,
    maxDuration: 120
  })
})
```

## Configuration Types

### Display Config
```typescript
interface CalendarConfig {
  title?: string;
  events: CalendarEvent[];
  weekStart?: number;  // 0 = Sunday, 1 = Monday
}

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;  // ISO datetime
  endTime: string;    // ISO datetime
  color?: string;     // blue, green, red, yellow, magenta, cyan
}
```

### Meeting Picker Config
```typescript
interface MeetingPickerConfig {
  calendars: Calendar[];
  slotGranularity?: number;  // 15, 30, or 60 minutes (default: 30)
  minDuration?: number;      // Minimum meeting duration in minutes
  maxDuration?: number;      // Maximum meeting duration in minutes
}

interface Calendar {
  name: string;              // Person's name
  color: string;             // Calendar color
  events: CalendarEvent[];   // Their busy times
}
```

## Keyboard Controls

**Display scenario:**
- Arrow keys: Navigate between days/weeks
- `t`: Jump to today
- `q` or `Esc`: Close canvas

**Meeting picker scenario:**
- Arrow keys: Navigate weeks
- Mouse click: Select a free time slot
- `t`: Jump to today
- `q` or `Esc`: Cancel selection

## Colors

Available event colors:
- `blue` - Default, general events
- `green` - Available/confirmed
- `red` - Busy/blocked
- `yellow` - Warning/tentative
- `magenta` - Personal
- `cyan` - External/other
