/**
 * TUI Canvas Protocol v1
 * 
 * This protocol defines how AI coding assistants communicate
 * with interactive terminal UI applications (canvases).
 * 
 * The protocol is framework-agnostic - canvases can be implemented
 * in any TUI framework (OpenTUI, Ink, Bubbletea, Textual, etc.)
 * as long as they speak this protocol.
 */

// ============ FRAMEWORK TYPES ============

/** Supported TUI frameworks */
export type Framework = 
  | "opentui"     // OpenTUI (primary, recommended)
  | "ink"         // Ink (React for terminals)
  | "bubbletea"   // Bubbletea (Go)
  | "textual"     // Textual (Python)
  | "ratatui"     // Ratatui (Rust)
  | "blessed"     // Blessed (Node.js)
  | "custom";     // Custom implementation

/** OpenTUI reconciler options */
export type OpenTUIReconciler = "core" | "react" | "solid";

// ============ CANVAS MANIFEST ============

/** 
 * Canvas Manifest - Describes a canvas and its implementations
 * Each canvas can have multiple implementations in different frameworks
 */
export interface CanvasManifest {
  /** Unique canvas identifier (e.g., "calendar", "document") */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Description of what this canvas does */
  description: string;
  
  /** Semantic version */
  version: string;
  
  /** Author/maintainer */
  author?: string;
  
  /** Repository URL */
  repository?: string;
  
  /** Available scenarios/modes for this canvas */
  scenarios: Record<string, ScenarioDefinition>;
  
  /** Available implementations keyed by framework */
  implementations: Record<string, CanvasImplementation>;
  
  /** Default implementation to use */
  defaultImplementation: string;
}

/** Definition of a canvas scenario/mode */
export interface ScenarioDefinition {
  /** Description of this scenario */
  description: string;
  
  /** JSON Schema for config input */
  configSchema?: object;
  
  /** JSON Schema for result output */
  resultSchema?: object;
}

/** A specific implementation of a canvas */
export interface CanvasImplementation {
  /** Which framework this uses */
  framework: Framework;
  
  /** Entry point file (relative to canvas directory) */
  entrypoint: string;
  
  /** For OpenTUI: which reconciler to use */
  reconciler?: OpenTUIReconciler;
  
  /** Optional status marker (e.g., placeholder) */
  status?: string;
  
  /** For compiled languages: path to binary */
  binary?: string;
  
  /** For Python: interpreter to use */
  interpreter?: string;
  
  /** Additional spawn arguments */
  args?: string[];
  
  /** Environment variables to set */
  env?: Record<string, string>;
}

// ============ SPAWN CONTRACT ============

/** Request to spawn a canvas instance */
export interface SpawnRequest {
  /** Canvas ID from manifest */
  canvasId: string;
  
  /** Scenario to run */
  scenario: string;
  
  /** Canvas-specific configuration */
  config?: unknown;
  
  /** Unique instance ID */
  instanceId: string;
  
  /** IPC socket path for communication */
  socketPath: string;
  
  /** Which implementation to use (default from manifest if not specified) */
  implementation?: string;
}

/** Options for spawning */
export interface SpawnOptions {
  /** tmux pane configuration */
  tmux?: {
    /** Split direction */
    split?: "horizontal" | "vertical";
    /** Pane size as percentage */
    size?: number;
    /** Reuse existing canvas pane */
    reuse?: boolean;
  };
  
  /** Working directory */
  cwd?: string;
  
  /** Additional environment variables */
  env?: Record<string, string>;
  
  /** Timeout in milliseconds */
  timeout?: number;
}

/** Result of spawning a canvas */
export interface SpawnResult {
  /** Whether spawn succeeded */
  success: boolean;
  
  /** Instance ID */
  instanceId: string;
  
  /** Error message if failed */
  error?: string;
  
  /** Process ID if spawned */
  pid?: number;
  
  /** tmux pane ID if applicable */
  paneId?: string;
}

// ============ IPC CONTRACT ============

/**
 * Messages sent FROM canvas TO controller (AI harness)
 */
export type CanvasMessage =
  | CanvasReadyMessage
  | CanvasSelectedMessage
  | CanvasUpdatedMessage
  | CanvasCancelledMessage
  | CanvasErrorMessage
  | CanvasPongMessage;

export interface CanvasReadyMessage {
  type: "ready";
  /** Which scenario is active */
  scenario: string;
  /** Canvas capabilities */
  capabilities?: string[];
}

export interface CanvasSelectedMessage {
  type: "selected";
  /** Selection data (schema defined by canvas) */
  data: unknown;
}

export interface CanvasUpdatedMessage {
  type: "updated";
  /** Updated state/content */
  data: unknown;
}

export interface CanvasCancelledMessage {
  type: "cancelled";
  /** Reason for cancellation */
  reason?: string;
}

export interface CanvasErrorMessage {
  type: "error";
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
}

export interface CanvasPongMessage {
  type: "pong";
  /** Echo back ping timestamp */
  timestamp: number;
}

/**
 * Messages sent FROM controller TO canvas
 */
export type ControllerMessage =
  | ControllerUpdateMessage
  | ControllerCloseMessage
  | ControllerQueryMessage
  | ControllerPingMessage;

export interface ControllerUpdateMessage {
  type: "update";
  /** New configuration to apply */
  config: unknown;
}

export interface ControllerCloseMessage {
  type: "close";
  /** Reason for closing */
  reason?: string;
}

export interface ControllerQueryMessage {
  type: "query";
  /** Type of query */
  queryType: string;
  /** Query parameters */
  params?: unknown;
}

export interface ControllerPingMessage {
  type: "ping";
  /** Timestamp for latency measurement */
  timestamp: number;
}

// ============ RESULT CONTRACT ============

/** Final result returned from a canvas interaction */
export interface CanvasResult<T = unknown> {
  /** Whether interaction completed successfully */
  success: boolean;
  
  /** Result data (type depends on canvas/scenario) */
  data?: T;
  
  /** Error message if failed */
  error?: string;
  
  /** Metadata about the interaction */
  metadata?: {
    /** Canvas ID */
    canvasId: string;
    /** Scenario that was run */
    scenario: string;
    /** Framework used */
    framework: Framework;
    /** Implementation name */
    implementation: string;
    /** Duration in milliseconds */
    durationMs: number;
  };
}

// ============ REGISTRY ============

/** Canvas registry entry */
export interface CanvasRegistryEntry {
  /** Canvas manifest */
  manifest: CanvasManifest;
  
  /** Path to canvas directory */
  path: string;
  
  /** Whether this is a built-in canvas */
  builtin: boolean;
}

/** Canvas registry interface */
export interface CanvasRegistry {
  /** Get all registered canvases */
  list(): CanvasRegistryEntry[];
  
  /** Get a specific canvas by ID */
  get(id: string): CanvasRegistryEntry | undefined;
  
  /** Register a canvas */
  register(entry: CanvasRegistryEntry): void;
  
  /** Discover canvases in a directory */
  discover(path: string): Promise<CanvasRegistryEntry[]>;
}

// ============ RUNTIME ADAPTER ============

/** 
 * Runtime adapter interface
 * Each TUI framework implements this to handle spawning and IPC
 */
export interface RuntimeAdapter {
  /** Framework this adapter handles */
  framework: Framework;
  
  /** Spawn a canvas instance */
  spawn(
    manifest: CanvasManifest,
    implementation: CanvasImplementation,
    request: SpawnRequest,
    options?: SpawnOptions
  ): Promise<SpawnResult>;
  
  /** Check if this runtime is available */
  isAvailable(): Promise<boolean>;
}
