/**
 * MCP Tool Definitions for OpenTUI Canvas
 * 
 * These tools are exposed via MCP and work with any compatible AI harness.
 */

// Tool definitions for MCP
export const toolDefinitions = {
  canvas_calendar: {
    name: 'canvas_calendar',
    description: `Display an interactive calendar canvas in a tmux split pane.

Use for:
- Displaying weekly calendar with events
- Picking meeting times (meeting-picker scenario)

The calendar supports keyboard navigation (arrow keys, Enter to select) and mouse clicks.

When waitForResult is true (default for meeting-picker), the tool waits for user selection and returns the result.

Requires tmux session.`,
    inputSchema: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['display', 'meeting-picker'],
          default: 'display',
          description: 'Calendar scenario: display (view only) or meeting-picker (select time slots)',
        },
        config: {
          type: 'string',
          description: 'Optional JSON config with events, weekStart, etc.',
        },
        waitForResult: {
          type: 'boolean',
          description: 'Wait for user interaction and return result. Default: true for meeting-picker, false for display.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds when waiting for result. Default: 300000 (5 minutes).',
        },
      },
    },
  },

  canvas_document: {
    name: 'canvas_document',
    description: `Display an interactive document canvas in a tmux split pane.

Use for:
- Displaying markdown content (display scenario)
- Text editing with selection (edit scenario)
- Email preview (email-preview scenario)

Supports syntax highlighting, text selection, and keyboard navigation.

When waitForResult is true (default for edit), the tool waits for user selection and returns the selected text.

Requires tmux session.`,
    inputSchema: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['display', 'edit', 'email-preview'],
          default: 'display',
          description: 'Document scenario',
        },
        content: {
          type: 'string',
          description: 'Markdown content to display',
        },
        title: {
          type: 'string',
          description: 'Optional document title',
        },
        waitForResult: {
          type: 'boolean',
          description: 'Wait for user interaction and return result. Default: true for edit, false for display/email-preview.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds when waiting for result. Default: 300000 (5 minutes).',
        },
      },
      required: ['content'],
    },
  },

  canvas_flight: {
    name: 'canvas_flight',
    description: `Display an interactive flight booking canvas in a tmux split pane.

Use for:
- Comparing flights between destinations
- Selecting seats on aircraft seatmaps
- Interactive flight booking experience

Features a cyberpunk-themed UI with keyboard and mouse navigation.

When waitForResult is true (default), the tool waits for user to select a flight/seat and returns the selection.

Config format:
{
  "flights": [{
    "id": "unique-id",
    "airline": "United Airlines",
    "flightNumber": "UA 123",
    "origin": { "code": "SFO", "name": "San Francisco Intl", "city": "San Francisco", "timezone": "PST" },
    "destination": { "code": "JFK", "name": "John F Kennedy Intl", "city": "New York", "timezone": "EST" },
    "departureTime": "2026-01-15T08:00:00",
    "arrivalTime": "2026-01-15T16:30:00",
    "duration": 330,
    "price": 34900,
    "currency": "USD",
    "cabinClass": "economy",
    "stops": 0
  }],
  "title": "Optional title"
}

Requires tmux session.`,
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'string',
          description: 'JSON config with flights array. Each flight needs: id, airline, flightNumber, origin (Airport object), destination (Airport object), departureTime, arrivalTime, duration (minutes), price (cents), currency, cabinClass, stops',
        },
        waitForResult: {
          type: 'boolean',
          description: 'Wait for user interaction and return result. Default: true.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds when waiting for result. Default: 300000 (5 minutes).',
        },
      },
      required: ['config'],
    },
  },
} as const;

export type ToolName = keyof typeof toolDefinitions;
