/**
 * @opentui/core - Core TUI Canvas Components
 * 
 * This package provides the core canvas components and utilities
 * for OpenTUI Canvas.
 */

// Terminal utilities
export { detectTerminal, getCanvasScope, spawnCanvas } from './terminal.js';
export type { TerminalEnvironment, SpawnResult, SpawnOptions } from './terminal.js';

// IPC utilities  
export * from './ipc/index.js';

// High-level API
export * from './api/index.js';

// Canvas types
export type { CalendarEvent, TimeSlot, TimeRange } from './canvases/calendar/types.js';
export type { DocumentConfig, EmailConfig, DocumentSelection } from './canvases/document/types.js';
export type { FlightConfig, Flight, FlightResult, Airport, Seatmap } from './canvases/flight/types.js';
