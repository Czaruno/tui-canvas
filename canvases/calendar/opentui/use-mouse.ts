// Mouse tracking hook for OpenTUI/Solid.js components
// Uses SGR extended mouse mode for accurate position tracking

import { createSignal, onCleanup } from "solid-js";

declare const process: any;

// SGR extended mouse mode escape sequences
const MOUSE_ENABLE = "\x1b[?1003h\x1b[?1006h"; // Track all movements + SGR format
const MOUSE_DISABLE = "\x1b[?1003l\x1b[?1006l";

export interface MousePosition {
  x: number; // 1-based column
  y: number; // 1-based row
}

export interface MouseEvent {
  x: number;
  y: number;
  button: number; // 0=left, 1=middle, 2=right
  pressed: boolean; // true on press, false on release
  isMotion: boolean; // true if this is a motion event (mouse move)
  modifiers: {
    shift: boolean;
    meta: boolean;
    ctrl: boolean;
  };
}

export interface UseMouseOptions {
  enabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  onMove?: (event: MouseEvent) => void;
  onRelease?: (event: MouseEvent) => void;
}

// Parse SGR mouse sequence: ESC[<btn;x;y(M|m)
// M = press, m = release
function parseMouseEvent(data: string): MouseEvent | null {
  // SGR format: \x1b[<btn;x;yM or \x1b[<btn;x;ym
  const match = data.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (!match) return null;

  const [, btnStr, xStr, yStr, action] = match;
  const btn = parseInt(btnStr, 10);
  const x = parseInt(xStr, 10);
  const y = parseInt(yStr, 10);
  const pressed = action === "M";

  // Decode button and modifiers from btn byte
  // Bits 0-1: button (0=left, 1=middle, 2=right, 3=release/no button)
  // Bit 2: shift
  // Bit 3: meta
  // Bit 4: ctrl
  // Bit 5: motion event (32)
  // Bit 6: scroll wheel (64)
  const button = btn & 3;
  const shift = (btn & 4) !== 0;
  const meta = (btn & 8) !== 0;
  const ctrl = (btn & 16) !== 0;
  const isMotion = (btn & 32) !== 0;

  return {
    x,
    y,
    button: button === 3 ? 0 : button, // button 3 means no button held
    pressed,
    isMotion,
    modifiers: { shift, meta, ctrl },
  };
}

export function useMouse(options: UseMouseOptions = {}) {
  const { enabled = true, onClick, onMove, onRelease } = options;
  const [position, setPosition] = createSignal<MousePosition | null>(null);
  const [isPressed, setIsPressed] = createSignal(false);

  if (!enabled) {
    return { position, isPressed };
  }

  const stdin = process.stdin;
  
  // Enable mouse tracking
  process.stdout.write(MOUSE_ENABLE);

  let buffer = "";

  const handleData = (data: string | Buffer) => {
    buffer += data.toString();

    // Try to parse mouse events from buffer
    let match;
    while ((match = buffer.match(/\x1b\[<\d+;\d+;\d+[Mm]/))) {
      const event = parseMouseEvent(match[0]);
      if (event) {
        setPosition({ x: event.x, y: event.y });
        
        // Only update isPressed for non-motion events
        if (!event.isMotion) {
          setIsPressed(event.pressed);
        }

        // Call appropriate callback based on event type
        if (event.isMotion) {
          onMove?.(event);
        } else if (event.pressed) {
          onClick?.(event);
        } else {
          onRelease?.(event);
        }
      }

      // Remove processed event from buffer
      buffer = buffer.slice(match.index! + match[0].length);
    }

    // Keep buffer from growing too large
    if (buffer.length > 100) {
      buffer = buffer.slice(-50);
    }
  };

  stdin.on("data", handleData);

  onCleanup(() => {
    stdin.off("data", handleData);
    process.stdout.write(MOUSE_DISABLE);
  });

  return { position, isPressed };
}
