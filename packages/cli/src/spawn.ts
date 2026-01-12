/**
 * Canvas Spawner
 * 
 * Handles spawning canvases with the appropriate runtime adapter.
 * Includes scoped pane isolation to prevent multiple AI sessions
 * from interfering with each other's canvas panes.
 */

import { spawn, spawnSync } from "child_process";
import { createHash } from "crypto";
import { join } from "path";
import type {
  CanvasManifest,
  CanvasImplementation,
  SpawnResult,
} from "@tui-canvas/protocol";

// Canvas owner tag name for tmux pane metadata
const CANVAS_OWNER_TAG = "@canvas-owner";

/**
 * Generate a unique scope identifier for canvas pane tracking.
 * This creates a deterministic hash from TMUX env + pane + cwd.
 */
function getCanvasScope(): string {
  const tmuxEnv = process.env.TMUX || "no-tmux";
  const tmuxPane = process.env.TMUX_PANE || "no-pane";
  const cwd = process.cwd();
  const context = `${tmuxEnv}:${tmuxPane}:${cwd}`;
  return createHash("sha256").update(context).digest("hex").slice(0, 12);
}

/**
 * Get the scoped pane tracking file path.
 */
function getCanvasPaneFile(): string {
  const scope = getCanvasScope();
  return `/tmp/tui-canvas-${scope}.pane`;
}

/**
 * Tag a tmux pane with our ownership scope.
 */
function tagPaneWithOwnership(paneId: string): void {
  const scope = getCanvasScope();
  spawnSync("tmux", ["set-option", "-p", "-t", paneId, CANVAS_OWNER_TAG, scope]);
}

/**
 * Verify that a pane is owned by this session.
 */
function verifyPaneOwnership(paneId: string): boolean {
  const scope = getCanvasScope();
  const result = spawnSync("tmux", ["show-options", "-p", "-t", paneId, "-v", CANVAS_OWNER_TAG]);
  if (result.status !== 0) return false;
  const owner = result.stdout?.toString().trim();
  return owner === scope;
}

/**
 * Find any orphaned panes that have our ownership tag.
 */
function findOrphanedPane(): string | null {
  const scope = getCanvasScope();
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
 * Get the canvas pane ID for this session.
 */
async function getCanvasPaneId(): Promise<string | null> {
  const paneFile = getCanvasPaneFile();
  
  try {
    const file = Bun.file(paneFile);
    if (await file.exists()) {
      const paneId = (await file.text()).trim();
      if (paneId) {
        // Verify the pane still exists
        const result = spawnSync("tmux", ["display-message", "-t", paneId, "-p", "#{pane_id}"]);
        const output = result.stdout?.toString().trim();
        if (result.status === 0 && output === paneId) {
          if (verifyPaneOwnership(paneId)) {
            return paneId;
          }
        }
        // Pane doesn't exist or wrong ownership - clean up
        await Bun.write(paneFile, "");
      }
    }
  } catch {
    // Ignore errors
  }
  
  // Check for orphaned panes with our ownership tag
  const orphanedPane = findOrphanedPane();
  if (orphanedPane) {
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

export interface SpawnCanvasOptions {
  manifest: CanvasManifest;
  implementation: CanvasImplementation;
  canvasPath: string;
  scenario: string;
  config?: unknown;
  instanceId: string;
  socketPath: string;
  useTmux?: boolean;
}

export async function spawnCanvas(options: SpawnCanvasOptions): Promise<SpawnResult> {
  const {
    manifest,
    implementation,
    canvasPath,
    scenario,
    config,
    instanceId,
    socketPath,
    useTmux = true,
  } = options;

  // Build the entrypoint path
  const entrypoint = join(canvasPath, implementation.entrypoint);

  // Build command arguments
  const args = [
    "run",
    entrypoint,
    "--id", instanceId,
    "--socket", socketPath,
    "--scenario", scenario,
  ];

  if (config) {
    const configFile = `/tmp/canvas-config-${instanceId}.json`;
    await Bun.write(configFile, JSON.stringify(config));
    args.push("--config-file", configFile);
  }

  if (implementation.args) {
    args.push(...implementation.args);
  }

  if (useTmux && process.env.TMUX) {
    return spawnInTmux(args, instanceId, implementation.env);
  } else {
    return spawnDirect(args, instanceId, implementation.env);
  }
}

async function spawnInTmux(
  args: string[],
  instanceId: string,
  env?: Record<string, string>
): Promise<SpawnResult> {
  const command = `bun ${args.join(" ")}`;
  
  // Check if we have an existing canvas pane to reuse
  const existingPaneId = await getCanvasPaneId();
  
  if (existingPaneId) {
    // Try to reuse existing pane
    const reused = await reuseExistingPane(existingPaneId, command);
    if (reused) {
      return {
        success: true,
        instanceId,
        paneId: existingPaneId,
      };
    }
    // Reuse failed - clear stale reference
    const paneFile = getCanvasPaneFile();
    await Bun.write(paneFile, "");
  }
  
  // Create a new split pane
  return createNewPane(command, instanceId, env);
}

async function reuseExistingPane(paneId: string, command: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Check if the pane is in "dead" state
    const stateResult = spawnSync("tmux", ["display-message", "-t", paneId, "-p", "#{pane_dead}"]);
    const isDead = stateResult.stdout?.toString().trim() === "1";
    
    if (isDead) {
      // Pane is dead - use respawn-pane
      const proc = spawn("tmux", ["respawn-pane", "-t", paneId, "-k", command]);
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    } else {
      // Pane is alive - send Ctrl+C then respawn
      const killProc = spawn("tmux", ["send-keys", "-t", paneId, "C-c"]);
      killProc.on("close", () => {
        setTimeout(() => {
          const proc = spawn("tmux", ["respawn-pane", "-t", paneId, "-k", command]);
          proc.on("close", (code) => resolve(code === 0));
          proc.on("error", () => resolve(false));
        }, 200);
      });
      killProc.on("error", () => resolve(false));
    }
  });
}

async function createNewPane(
  command: string,
  instanceId: string,
  env?: Record<string, string>
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    // Horizontal split, 67% width for canvas
    const tmuxArgs = [
      "split-window",
      "-h",
      "-p", "67",
      "-P", "-F", "#{pane_id}",
      command,
    ];

    const proc = spawn("tmux", tmuxArgs, {
      env: { ...process.env, ...env },
    });
    
    let paneId = "";

    proc.stdout?.on("data", (data) => {
      paneId += data.toString();
    });

    proc.on("close", async (code) => {
      if (code === 0 && paneId.trim()) {
        const newPaneId = paneId.trim();
        await saveCanvasPaneId(newPaneId);
        // Set remain-on-exit so pane stays alive after canvas exits
        spawnSync("tmux", ["set-option", "-p", "-t", newPaneId, "remain-on-exit", "on"]);
        resolve({
          success: true,
          instanceId,
          paneId: newPaneId,
        });
      } else {
        resolve({
          success: false,
          instanceId,
          error: `tmux spawn failed with code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        instanceId,
        error: err.message,
      });
    });
  });
}

async function spawnDirect(
  args: string[],
  instanceId: string,
  env?: Record<string, string>
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const proc = spawn("bun", args, {
      env: { ...process.env, ...env },
      stdio: "inherit",
    });

    proc.on("spawn", () => {
      resolve({
        success: true,
        instanceId,
        pid: proc.pid,
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        instanceId,
        error: err.message,
      });
    });
  });
}

// ============ CLEANUP & STATUS FUNCTIONS ============

export interface OrphanedPane {
  id: string;
  reason: string;
}

export interface CleanupResult {
  found: OrphanedPane[];
  closed: number;
}

export interface CanvasPaneInfo {
  scope: string;
  paneFile: string;
  currentPaneId: string | null;
  paneExists: boolean;
  paneOwned: boolean;
  allCanvasPanes: { id: string; owned: boolean }[];
}

/**
 * Find all panes that have canvas ownership tags.
 */
function findAllCanvasPanes(): { id: string; owner: string }[] {
  const result = spawnSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}"]);
  if (result.status !== 0) return [];
  
  const paneIds = result.stdout?.toString().trim().split("\n").filter(Boolean) || [];
  const canvasPanes: { id: string; owner: string }[] = [];
  
  for (const paneId of paneIds) {
    const ownerResult = spawnSync("tmux", ["show-options", "-p", "-t", paneId, "-v", CANVAS_OWNER_TAG]);
    if (ownerResult.status === 0) {
      const owner = ownerResult.stdout?.toString().trim();
      if (owner) {
        canvasPanes.push({ id: paneId, owner });
      }
    }
  }
  
  return canvasPanes;
}

/**
 * Find panes running canvas processes (by examining process command).
 * This catches legacy panes that weren't tagged with ownership.
 */
function findCanvasProcessPanes(): { id: string; pid: number; command: string }[] {
  const result = spawnSync("tmux", [
    "list-panes", "-a", 
    "-F", "#{pane_id}:#{pane_pid}:#{pane_current_command}"
  ]);
  if (result.status !== 0) return [];
  
  const canvasPanes: { id: string; pid: number; command: string }[] = [];
  const lines = result.stdout?.toString().trim().split("\n").filter(Boolean) || [];
  
  for (const line of lines) {
    const [paneId, pidStr, command] = line.split(":");
    if (!paneId || !pidStr) continue;
    
    // Check if this pane is running bun with a canvas entrypoint
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid)) continue;
    
    // Get the full command line for this process
    const psResult = spawnSync("ps", ["-p", pidStr, "-o", "args="]);
    const fullCommand = psResult.stdout?.toString().trim() || "";
    
    // Check if it's running a canvas
    if (fullCommand.includes("/canvases/") && fullCommand.includes("index.tsx")) {
      canvasPanes.push({ id: paneId, pid, command: fullCommand });
    }
  }
  
  return canvasPanes;
}

/**
 * Check if a pane tracking file exists for a given scope.
 */
async function scopeHasValidPaneFile(scope: string): Promise<boolean> {
  const paneFile = `/tmp/tui-canvas-${scope}.pane`;
  try {
    const file = Bun.file(paneFile);
    if (await file.exists()) {
      const content = (await file.text()).trim();
      return content.length > 0;
    }
  } catch {
    // Ignore
  }
  return false;
}

/**
 * Find and optionally close orphaned canvas panes.
 * A pane is considered orphaned if:
 * 1. It has a canvas owner tag but no corresponding pane tracking file
 * 2. It's in a "dead" state (process exited)
 * 3. It's running a canvas process but isn't owned by current session (legacy panes)
 */
export async function cleanupOrphanedPanes(dryRun = false): Promise<CleanupResult> {
  const found: OrphanedPane[] = [];
  let closed = 0;
  const processedPanes = new Set<string>();
  
  const currentScope = getCanvasScope();
  const currentPaneId = await getCanvasPaneId();
  
  // 1. Check tagged canvas panes
  const taggedPanes = findAllCanvasPanes();
  
  for (const pane of taggedPanes) {
    processedPanes.add(pane.id);
    let isOrphaned = false;
    let reason = "";
    
    // Skip our own current pane
    if (pane.id === currentPaneId && pane.owner === currentScope) {
      continue;
    }
    
    // Check if pane is dead
    const stateResult = spawnSync("tmux", ["display-message", "-t", pane.id, "-p", "#{pane_dead}"]);
    const isDead = stateResult.stdout?.toString().trim() === "1";
    
    if (isDead) {
      isOrphaned = true;
      reason = "dead (process exited)";
    } else if (pane.owner !== currentScope) {
      // Check if the owning scope still has a valid pane file pointing to this pane
      const hasValidFile = await scopeHasValidPaneFile(pane.owner);
      if (!hasValidFile) {
        isOrphaned = true;
        reason = `orphaned (scope ${pane.owner.slice(0, 8)}... has no pane file)`;
      }
    }
    
    if (isOrphaned) {
      found.push({ id: pane.id, reason });
      
      if (!dryRun) {
        spawnSync("tmux", ["kill-pane", "-t", pane.id]);
        closed++;
      }
    }
  }
  
  // 2. Check for legacy untagged panes running canvas processes
  const processPanes = findCanvasProcessPanes();
  
  for (const pane of processPanes) {
    // Skip if already processed via tags
    if (processedPanes.has(pane.id)) continue;
    
    // Skip our own current pane
    if (pane.id === currentPaneId) continue;
    
    // This is a legacy canvas pane without ownership tag - consider orphaned
    found.push({ 
      id: pane.id, 
      reason: `legacy canvas (no ownership tag): ${pane.command.slice(0, 60)}...` 
    });
    
    if (!dryRun) {
      spawnSync("tmux", ["kill-pane", "-t", pane.id]);
      closed++;
    }
  }
  
  return { found, closed };
}

/**
 * Get information about the current canvas pane status.
 */
export async function getCanvasPaneInfo(): Promise<CanvasPaneInfo> {
  const scope = getCanvasScope();
  const paneFile = getCanvasPaneFile();
  
  let currentPaneId: string | null = null;
  let paneExists = false;
  let paneOwned = false;
  
  try {
    const file = Bun.file(paneFile);
    if (await file.exists()) {
      currentPaneId = (await file.text()).trim() || null;
    }
  } catch {
    // Ignore
  }
  
  if (currentPaneId) {
    const result = spawnSync("tmux", ["display-message", "-t", currentPaneId, "-p", "#{pane_id}"]);
    paneExists = result.status === 0 && result.stdout?.toString().trim() === currentPaneId;
    
    if (paneExists) {
      paneOwned = verifyPaneOwnership(currentPaneId);
    }
  }
  
  // Find all canvas panes
  const allCanvasPanes = findAllCanvasPanes().map(p => ({
    id: p.id,
    owned: p.owner === scope,
  }));
  
  return {
    scope,
    paneFile,
    currentPaneId,
    paneExists,
    paneOwned,
    allCanvasPanes,
  };
}
