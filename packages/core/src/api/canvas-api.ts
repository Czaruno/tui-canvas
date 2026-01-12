// High-Level Canvas API for OpenCode
// Provides simple async interface for spawning interactive canvases

import { createControllerServer } from "../ipc/server";
import { getSocketPath } from "../ipc/types";
import { spawnCanvas } from "../terminal";
import type { CanvasMessage } from "../ipc/types";
import type {
  MeetingPickerConfig,
  MeetingPickerResult,
  DocumentConfig,
  DocumentSelection,
} from "../scenarios/types";

export interface CanvasResult<T = unknown> {
  success: boolean;
  data?: T;
  cancelled?: boolean;
  error?: string;
}

export interface SpawnOptions {
  timeout?: number; // ms, default 5 minutes
  onReady?: () => void;
}

/**
 * Spawn an interactive canvas and wait for user selection.
 * 
 * This creates an IPC server, spawns the canvas, and waits for the canvas
 * to send a "selected" or "cancelled" message.
 */
export async function spawnCanvasWithIPC<TConfig, TResult>(
  kind: string,
  scenario: string,
  config: TConfig,
  options: SpawnOptions = {}
): Promise<CanvasResult<TResult>> {
  const { timeout = 300000, onReady } = options;
  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const socketPath = getSocketPath(id);

  let resolved = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let resolvePromise: (result: CanvasResult<TResult>) => void;
  let server: Awaited<ReturnType<typeof createControllerServer>> | null = null;

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (server) {
      server.close();
      server = null;
    }
  };

  const handleMessage = (msg: CanvasMessage) => {
    if (resolved) return;

    switch (msg.type) {
      case "ready":
        onReady?.();
        break;

      case "selected":
        resolved = true;
        cleanup();
        resolvePromise({
          success: true,
          data: msg.data as TResult,
        });
        break;

      case "cancelled":
        resolved = true;
        cleanup();
        resolvePromise({
          success: true,
          cancelled: true,
        });
        break;

      case "error":
        resolved = true;
        cleanup();
        resolvePromise({
          success: false,
          error: msg.message,
        });
        break;

      case "pong":
        // Response to ping, ignore
        break;
    }
  };

  // Create controller server first, then spawn canvas
  server = await createControllerServer({
    socketPath,
    onClientConnect() {
      // Canvas connected, waiting for ready message
    },
    onMessage: handleMessage,
    onClientDisconnect() {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolvePromise({
          success: false,
          error: "Canvas disconnected unexpectedly",
        });
      }
    },
    onError(error) {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolvePromise({
          success: false,
          error: error.message,
        });
      }
    },
  });

  return new Promise((resolve) => {
    resolvePromise = resolve;

    // Set timeout
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server?.send({ type: "close" });
        cleanup();
        resolve({
          success: false,
          error: "Timeout waiting for user selection",
        });
      }
    }, timeout);

    // Spawn the canvas
    spawnCanvas(kind, id, JSON.stringify(config), {
      socketPath,
      scenario,
    }).catch((err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({
          success: false,
          error: `Failed to spawn canvas: ${err.message}`,
        });
      }
    });
  });
}

/**
 * Spawn a meeting picker canvas
 * Convenience wrapper for the meeting-picker scenario
 */
export async function pickMeetingTime(
  config: MeetingPickerConfig,
  options?: SpawnOptions
): Promise<CanvasResult<MeetingPickerResult>> {
  return spawnCanvasWithIPC<MeetingPickerConfig, MeetingPickerResult>(
    "calendar",
    "meeting-picker",
    config,
    options
  );
}

/**
 * Display a calendar (non-interactive)
 * Convenience wrapper for the display scenario
 */
export async function displayCalendar(
  config: {
    title?: string;
    events?: Array<{
      id: string;
      title: string;
      startTime: string;
      endTime: string;
      color?: string;
      allDay?: boolean;
    }>;
  },
  options?: SpawnOptions
): Promise<CanvasResult<void>> {
  return spawnCanvasWithIPC("calendar", "display", config, options);
}

// ============================================
// Document Canvas API
// ============================================

/**
 * Display a document (read-only view)
 * Shows markdown-rendered content with optional diff highlighting
 */
export async function displayDocument(
  config: DocumentConfig,
  options?: SpawnOptions
): Promise<CanvasResult<void>> {
  return spawnCanvasWithIPC("document", "display", config, options);
}

/**
 * Open a document for editing/selection
 * Returns the selected text when user makes a selection via click-and-drag
 * Selection is sent automatically as the user selects text
 */
export async function editDocument(
  config: DocumentConfig,
  options?: SpawnOptions
): Promise<CanvasResult<DocumentSelection>> {
  return spawnCanvasWithIPC<DocumentConfig, DocumentSelection>(
    "document",
    "edit",
    config,
    options
  );
}

/**
 * Preview an email with specialized formatting
 */
export async function previewEmail(
  config: DocumentConfig,
  options?: SpawnOptions
): Promise<CanvasResult<void>> {
  return spawnCanvasWithIPC("document", "email-preview", config, options);
}

// ============================================
// Flight Canvas API
// ============================================

export interface FlightConfig {
  flights: Array<{
    id: string;
    airline: string;
    flightNumber: string;
    departure: string;
    arrival: string;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    price: number;
    class: string;
  }>;
  seatmap?: {
    rows: number;
    seatsPerRow: number;
    unavailable?: string[];
  };
}

export interface FlightBookingResult {
  flightId: string;
  seatId?: string;
}

/**
 * Show flight comparison and booking interface
 * Returns the selected flight and optional seat selection
 */
export async function bookFlight(
  config: FlightConfig,
  options?: SpawnOptions
): Promise<CanvasResult<FlightBookingResult>> {
  return spawnCanvasWithIPC<FlightConfig, FlightBookingResult>(
    "flight",
    "booking",
    config,
    options
  );
}

/**
 * Display flights for comparison (view-only, no booking)
 */
export async function displayFlights(
  config: FlightConfig,
  options?: SpawnOptions
): Promise<CanvasResult<void>> {
  return spawnCanvasWithIPC("flight", "display", config, options);
}
