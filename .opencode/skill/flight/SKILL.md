---
name: flight
description: |
  Flight canvas for comparing flights and selecting seats. Use when users need to browse flight options and book seats with a cyberpunk-themed interface.
---

# Flight Canvas

Cyberpunk-themed flight comparison and seat selection interface.

## Example Prompts

- "Find flights from San Francisco to Denver on January 15th"
- "Book me a window seat on the cheapest nonstop to NYC"
- "Compare morning flights from LAX to Seattle next Monday"
- "I need a business class seat to Chicago with extra legroom"
- "Show me United flights to Boston under $300"

## Scenario

### `booking` (default)
Interactive flight comparison and seat selection.

- Shows flight options with airline, times, duration, and price
- Interactive seat map for seat selection (when seatmap provided)
- Keyboard navigation between flights and seats
- Cyberpunk aesthetic with neon colors

## Tool Usage

```typescript
canvas_flight({
  config: JSON.stringify({
    title: "// SFO -> DEN //",
    flights: [
      {
        id: "ua123",
        airline: "United Airlines",
        flightNumber: "UA 123",
        origin: {
          code: "SFO",
          name: "San Francisco International",
          city: "San Francisco",
          timezone: "PST"
        },
        destination: {
          code: "DEN",
          name: "Denver International",
          city: "Denver",
          timezone: "MST"
        },
        departureTime: "2026-01-15T08:00:00",
        arrivalTime: "2026-01-15T11:30:00",
        duration: 150,
        price: 29900,  // cents ($299.00)
        currency: "USD",
        cabinClass: "economy",
        aircraft: "Boeing 737-800",
        stops: 0
      }
    ]
  })
})
```

## Configuration Types

```typescript
interface FlightConfig {
  flights: Flight[];
  title?: string;           // Header title (cyberpunk style)
  showSeatmap?: boolean;    // Enable seat selection
  selectedFlightId?: string; // Pre-select a flight
}

interface Flight {
  id: string;
  airline: string;          // e.g., "United Airlines"
  flightNumber: string;     // e.g., "UA 123"
  origin: Airport;
  destination: Airport;
  departureTime: string;    // ISO datetime
  arrivalTime: string;      // ISO datetime
  duration: number;         // Minutes
  price: number;            // Cents (29900 = $299.00)
  currency: string;         // e.g., "USD"
  cabinClass: "economy" | "premium" | "business" | "first";
  aircraft?: string;        // e.g., "Boeing 737-800"
  stops: number;            // 0 = nonstop
  seatmap?: Seatmap;        // Optional seat selection
}

interface Airport {
  code: string;             // 3-letter code (SFO, JFK, etc.)
  name: string;             // Full airport name
  city: string;
  timezone: string;         // PST, EST, etc.
}

interface Seatmap {
  rows: number;             // Total rows
  seatsPerRow: string[];    // e.g., ["A", "B", "C", "D", "E", "F"]
  aisleAfter: string[];     // e.g., ["C"] = aisle after seat C
  unavailable: string[];    // Blocked seats (e.g., ["1A", "1B"])
  premium: string[];        // Extra legroom/exit row seats
  occupied: string[];       // Already booked seats
}
```

## Keyboard Controls

- `Up/Down`: Navigate between flights
- `Tab`: Switch focus between flight list and seatmap
- Arrow keys (in seatmap): Move seat cursor
- `Space`: Select/deselect seat
- `Enter`: Confirm selection
- `Shift+Enter`: Confirm immediately (skip countdown)
- `q` or `Esc`: Cancel

## Seat Legend

| Symbol | Meaning |
|--------|---------|
| `[ ]` | Available seat |
| `[X]` | Occupied seat |
| `[/]` | Unavailable/blocked |
| `[+]` | Premium seat (extra legroom) |
| `[*]` | Currently selected |

## Example with Seatmap

```typescript
canvas_flight({
  config: JSON.stringify({
    title: "// FLIGHT_BOOKING_TERMINAL //",
    flights: [{
      id: "ua123",
      airline: "United Airlines",
      flightNumber: "UA 123",
      origin: { code: "SFO", name: "San Francisco Intl", city: "San Francisco", timezone: "PST" },
      destination: { code: "JFK", name: "John F Kennedy Intl", city: "New York", timezone: "EST" },
      departureTime: "2026-01-15T08:00:00",
      arrivalTime: "2026-01-15T16:30:00",
      duration: 330,
      price: 34900,
      currency: "USD",
      cabinClass: "economy",
      aircraft: "Boeing 737-800",
      stops: 0,
      seatmap: {
        rows: 30,
        seatsPerRow: ["A", "B", "C", "D", "E", "F"],
        aisleAfter: ["C"],
        unavailable: ["1A", "1B", "1C", "1D", "1E", "1F"],
        premium: ["2A", "2B", "2C", "2D", "2E", "2F", "14A", "14B", "14C", "14D", "14E", "14F"],
        occupied: ["3A", "3C", "4B", "5D", "10A", "10F", "15C"]
      }
    }]
  })
})
```

## Price Formatting

Prices are in cents for precision. The canvas formats them automatically:
- `29900` displays as `$299`
- `34500` displays as `$345`
- `125000` displays as `$1,250`
