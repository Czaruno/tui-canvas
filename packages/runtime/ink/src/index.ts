/**
 * Ink Runtime Adapter for TUI Canvas
 * 
 * This adapter handles spawning canvases built with Ink (React for terminals).
 * It's the secondary/legacy runtime, with OpenTUI being the primary.
 */

import { spawn, spawnSync } from "child_process";
import type {
  RuntimeAdapter,
  CanvasManifest,
  CanvasImplementation,
  SpawnRequest,
  SpawnOptions,
  SpawnResult,
  Framework,
} from "@tui-canvas/protocol";

export class InkRuntime implements RuntimeAdapter {
  readonly framework: Framework = "ink";

  async spawn(
    manifest: CanvasManifest,
    implementation: CanvasImplementation,
    request: SpawnRequest,
    options?: SpawnOptions
  ): Promise<SpawnResult> {
    // Validate this is an Ink implementation
    if (implementation.framework !== "ink") {
      return {
        success: false,
        instanceId: request.instanceId,
        error: `Ink runtime cannot spawn ${implementation.framework} canvas`,
      };
    }

    const entrypoint = implementation.entrypoint;
    
    // Build spawn arguments for Ink canvas
    const args = [
      "run",
      entrypoint,
      "--instance-id", request.instanceId,
      "--socket", request.socketPath,
      "--scenario", request.scenario,
    ];

    if (request.config) {
      args.push("--config", JSON.stringify(request.config));
    }

    // Add any additional args from implementation
    if (implementation.args) {
      args.push(...implementation.args);
    }

    // Determine how to spawn (tmux or direct)
    if (options?.tmux && process.env.TMUX) {
      return this.spawnInTmux(args, request, options);
    } else {
      return this.spawnDirect(args, request, options);
    }
  }

  private async spawnInTmux(
    args: string[],
    request: SpawnRequest,
    options?: SpawnOptions
  ): Promise<SpawnResult> {
    return new Promise((resolve) => {
      const command = `bun ${args.join(" ")}`;
      const split = options?.tmux?.split === "vertical" ? "-v" : "-h";
      const size = options?.tmux?.size || 50;

      const tmuxArgs = [
        "split-window",
        split,
        "-p", String(size),
        "-P", "-F", "#{pane_id}",
        command,
      ];

      const proc = spawn("tmux", tmuxArgs);
      let paneId = "";

      proc.stdout?.on("data", (data) => {
        paneId += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0 && paneId.trim()) {
          resolve({
            success: true,
            instanceId: request.instanceId,
            paneId: paneId.trim(),
          });
        } else {
          resolve({
            success: false,
            instanceId: request.instanceId,
            error: `tmux spawn failed with code ${code}`,
          });
        }
      });

      proc.on("error", (err) => {
        resolve({
          success: false,
          instanceId: request.instanceId,
          error: err.message,
        });
      });
    });
  }

  private async spawnDirect(
    args: string[],
    request: SpawnRequest,
    options?: SpawnOptions
  ): Promise<SpawnResult> {
    return new Promise((resolve) => {
      const proc = spawn("bun", args, {
        cwd: options?.cwd,
        env: { ...process.env, ...options?.env },
        stdio: "inherit",
      });

      proc.on("spawn", () => {
        resolve({
          success: true,
          instanceId: request.instanceId,
          pid: proc.pid,
        });
      });

      proc.on("error", (err) => {
        resolve({
          success: false,
          instanceId: request.instanceId,
          error: err.message,
        });
      });
    });
  }

  async isAvailable(): Promise<boolean> {
    // Check if ink is installed
    try {
      await import("ink");
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const inkRuntime = new InkRuntime();
export default inkRuntime;
