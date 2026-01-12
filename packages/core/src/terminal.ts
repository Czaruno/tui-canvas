import { spawn, spawnSync } from "child_process";
import { createHash } from "crypto";

export interface TerminalEnvironment {
  inTmux: boolean;
  summary: string;
}

export function detectTerminal(): TerminalEnvironment {
  const inTmux = !!process.env.TMUX;
  const summary = inTmux ? "tmux" : "no tmux";
  return { inTmux, summary };
}

/**
 * Generate a unique scope identifier for canvas pane tracking.
 * 
 * This creates a deterministic hash from:
 * - TMUX environment (socket path, server PID, session index)
 * - TMUX_PANE (the pane where OpenCode is running, e.g., "%32")
 * - Current working directory (project path)
 * 
 * This ensures:
 * - Different tmux sessions get different scopes
 * - Different OpenCode instances (even in same session) get different scopes
 * - Same OpenCode instance always gets same scope (survives restarts)
 * - No interference between projects or sessions
 */
export function getCanvasScope(): string {
  // $TMUX format: "/private/tmp/tmux-501/default,12345,0"
  // Contains: socket path, server PID, session index
  const tmuxEnv = process.env.TMUX || "no-tmux";
  
  // $TMUX_PANE is the pane ID where THIS process runs (e.g., "%32")
  // This differentiates multiple OpenCode instances in same session
  const tmuxPane = process.env.TMUX_PANE || "no-pane";
  
  // Working directory scopes to the project
  const cwd = process.cwd();
  
  // Create deterministic hash from context
  const context = `${tmuxEnv}:${tmuxPane}:${cwd}`;
  const hash = createHash("sha256").update(context).digest("hex").slice(0, 12);
  
  return hash;
}

/**
 * Get the scoped pane tracking file path.
 * Each OpenCode instance gets its own tracking file based on its unique scope.
 */
function getCanvasPaneFile(): string {
  const scope = getCanvasScope();
  return `/tmp/opencode-canvas-${scope}.pane`;
}

export interface SpawnResult {
  method: string;
  pid?: number;
}

export interface SpawnOptions {
  socketPath?: string;
  scenario?: string;
}

export async function spawnCanvas(
  kind: string,
  id: string,
  configJson?: string,
  options?: SpawnOptions
): Promise<SpawnResult> {
  const env = detectTerminal();

  if (!env.inTmux) {
    throw new Error("OpenCode Canvas requires tmux. Please run inside a tmux session.");
  }

  // Get the directory of this script (canvas directory)
  const scriptDir = import.meta.dir.replace("/src", "");
  const runScript = `${scriptDir}/run-canvas.sh`;

  // Auto-generate socket path for IPC if not provided
  const socketPath = options?.socketPath || `/tmp/canvas-${id}.sock`;

  // Build the command to run
  let command = `${runScript} show ${kind} --id ${id}`;
  if (configJson) {
    // Write config to a temp file to avoid shell escaping issues
    const configFile = `/tmp/canvas-config-${id}.json`;
    await Bun.write(configFile, configJson);
    command += ` --config "$(cat ${configFile})"`;
  }
  command += ` --socket ${socketPath}`;
  if (options?.scenario) {
    command += ` --scenario ${options.scenario}`;
  }

  const result = await spawnTmux(command);
  if (result) return { method: "tmux" };

  throw new Error("Failed to spawn tmux pane");
}

// Canvas owner tag name for tmux pane metadata
const CANVAS_OWNER_TAG = "@canvas-owner";

/**
 * Tag a tmux pane with our ownership scope.
 * This allows verification that a pane belongs to this OpenCode instance.
 */
function tagPaneWithOwnership(paneId: string): void {
  const scope = getCanvasScope();
  spawnSync("tmux", ["set-option", "-p", "-t", paneId, CANVAS_OWNER_TAG, scope]);
}

/**
 * Verify that a pane is owned by this OpenCode instance.
 * Returns true if the pane's @canvas-owner tag matches our scope.
 */
function verifyPaneOwnership(paneId: string): boolean {
  const scope = getCanvasScope();
  const result = spawnSync("tmux", ["show-options", "-p", "-t", paneId, "-v", CANVAS_OWNER_TAG]);
  if (result.status !== 0) return false;
  const owner = result.stdout?.toString().trim();
  return owner === scope;
}

/**
 * Find any orphaned panes that have our ownership tag but aren't in our pane file.
 * This can happen if the pane file was deleted but the pane still exists.
 */
function findOrphanedPane(): string | null {
  const scope = getCanvasScope();
  
  // List all panes and check for our ownership tag
  const result = spawnSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}"]);
  if (result.status !== 0) return null;
  
  const paneIds = result.stdout?.toString().trim().split("\n").filter(Boolean) || [];
  
  for (const paneId of paneIds) {
    if (verifyPaneOwnership(paneId)) {
      return paneId;
    }
  }
  
  return null;
}

/**
 * Get the canvas pane ID for this OpenCode instance.
 * First checks the pane file, then looks for orphaned panes with our ownership tag.
 */
async function getCanvasPaneId(): Promise<string | null> {
  const paneFile = getCanvasPaneFile();
  
  // First, try to get pane ID from file
  try {
    const file = Bun.file(paneFile);
    if (await file.exists()) {
      const paneId = (await file.text()).trim();
      if (paneId) {
        // Verify the pane still exists
        const result = spawnSync("tmux", ["display-message", "-t", paneId, "-p", "#{pane_id}"]);
        const output = result.stdout?.toString().trim();
        if (result.status === 0 && output === paneId) {
          // Verify ownership - ensure this pane belongs to US
          if (verifyPaneOwnership(paneId)) {
            return paneId;
          }
        }
        // Pane doesn't exist or wrong ownership - clean up file
        await Bun.write(paneFile, "");
      }
    }
  } catch {
    // Ignore errors
  }
  
  // File didn't have valid pane - check for orphaned panes with our ownership tag
  const orphanedPane = findOrphanedPane();
  if (orphanedPane) {
    // Found an orphaned pane - reclaim it by saving to file
    await Bun.write(paneFile, orphanedPane);
    return orphanedPane;
  }
  
  return null;
}

/**
 * Save the canvas pane ID and tag it with ownership.
 */
async function saveCanvasPaneId(paneId: string): Promise<void> {
  const paneFile = getCanvasPaneFile();
  await Bun.write(paneFile, paneId);
  tagPaneWithOwnership(paneId);
}

async function createNewPane(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Use split-window -h for vertical split (side by side)
    // -p 67 gives canvas 2/3 width (1:2 ratio, OpenCode:Canvas)
    // -P -F prints the new pane ID so we can save it
    const args = ["split-window", "-h", "-p", "67", "-P", "-F", "#{pane_id}", command];
    const proc = spawn("tmux", args);
    let paneId = "";
    proc.stdout?.on("data", (data) => {
      paneId += data.toString();
    });
    proc.on("close", async (code) => {
      if (code === 0 && paneId.trim()) {
        const newPaneId = paneId.trim();
        await saveCanvasPaneId(newPaneId);
        // Set remain-on-exit so the pane stays alive after canvas exits
        // This allows us to respawn new canvases in the same pane
        spawnSync("tmux", ["set-option", "-p", "-t", newPaneId, "remain-on-exit", "on"]);
      }
      resolve(code === 0);
    });
    proc.on("error", () => resolve(false));
  });
}

async function reuseExistingPane(paneId: string, command: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Check if the pane is in "dead" state (process exited but remain-on-exit kept it)
    const stateResult = spawnSync("tmux", ["display-message", "-t", paneId, "-p", "#{pane_dead}"]);
    const isDead = stateResult.stdout?.toString().trim() === "1";
    
    if (isDead) {
      // Pane is dead (previous canvas exited) - use respawn-pane to run new command
      const args = ["respawn-pane", "-t", paneId, "-k", command];
      const proc = spawn("tmux", args);
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    } else {
      // Pane is alive - send Ctrl+C to interrupt current canvas
      const killProc = spawn("tmux", ["send-keys", "-t", paneId, "C-c"]);
      killProc.on("close", () => {
        // Wait for canvas to exit, then respawn
        setTimeout(() => {
          // Use respawn-pane -k to kill any remaining process and start new one
          const args = ["respawn-pane", "-t", paneId, "-k", command];
          const proc = spawn("tmux", args);
          proc.on("close", (code) => resolve(code === 0));
          proc.on("error", () => resolve(false));
        }, 200);
      });
      killProc.on("error", () => resolve(false));
    }
  });
}

async function spawnTmux(command: string): Promise<boolean> {
  // Check if we have an existing canvas pane to reuse
  const existingPaneId = await getCanvasPaneId();

  if (existingPaneId) {
    // Try to reuse existing pane
    const reused = await reuseExistingPane(existingPaneId, command);
    if (reused) {
      return true;
    }
    // Reuse failed (pane may have been closed) - clear stale reference and create new
    const paneFile = getCanvasPaneFile();
    await Bun.write(paneFile, "");
  }

  // Create a new split pane
  return createNewPane(command);
}
