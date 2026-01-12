#!/usr/bin/env bun
/**
 * TUI Canvas CLI
 * 
 * Framework-agnostic CLI for spawning and managing canvases.
 * Supports OpenTUI (primary), Ink, and other TUI frameworks.
 */

import { Command } from "commander";
import { spawnSync } from "child_process";
import { loadRegistry, discoverCanvases } from "./registry.js";
import { spawnCanvas, cleanupOrphanedPanes, getCanvasPaneInfo } from "./spawn.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANVASES_DIR = join(__dirname, "../../../canvases");

const program = new Command();

program
  .name("tui-canvas")
  .description("TUI Canvas - Framework-agnostic interactive terminal canvases for AI assistants")
  .version("0.3.0");

// List available canvases
program
  .command("list")
  .description("List available canvases")
  .action(async () => {
    const registry = await loadRegistry(CANVASES_DIR);
    
    console.log("\nAvailable Canvases:\n");
    
    for (const entry of registry.list()) {
      const { manifest } = entry;
      const impls = Object.keys(manifest.implementations).join(", ");
      console.log(`  ${manifest.id}`);
      console.log(`    Name: ${manifest.name}`);
      console.log(`    Description: ${manifest.description}`);
      console.log(`    Scenarios: ${Object.keys(manifest.scenarios).join(", ")}`);
      console.log(`    Implementations: ${impls}`);
      console.log(`    Default: ${manifest.defaultImplementation}`);
      console.log();
    }
  });

// Show canvas info
program
  .command("info <canvas>")
  .description("Show detailed info about a canvas")
  .action(async (canvasId: string) => {
    const registry = await loadRegistry(CANVASES_DIR);
    const entry = registry.get(canvasId);
    
    if (!entry) {
      console.error(`Canvas not found: ${canvasId}`);
      process.exit(1);
    }
    
    const { manifest } = entry;
    console.log("\nCanvas:", manifest.name);
    console.log("ID:", manifest.id);
    console.log("Version:", manifest.version);
    console.log("Description:", manifest.description);
    console.log("\nScenarios:");
    for (const [name, scenario] of Object.entries(manifest.scenarios)) {
      console.log(`  ${name}: ${scenario.description}`);
    }
    console.log("\nImplementations:");
    for (const [name, impl] of Object.entries(manifest.implementations)) {
      console.log(`  ${name}:`);
      console.log(`    Framework: ${impl.framework}`);
      console.log(`    Entrypoint: ${impl.entrypoint}`);
      if (impl.reconciler) {
        console.log(`    Reconciler: ${impl.reconciler}`);
      }
    }
    console.log("\nDefault implementation:", manifest.defaultImplementation);
  });

// Spawn a canvas
program
  .command("spawn <canvas>")
  .description("Spawn a canvas in a tmux pane")
  .option("-s, --scenario <scenario>", "Scenario to run", "default")
  .option("-c, --config <json>", "Canvas configuration (JSON)")
  .option("-i, --implementation <impl>", "Implementation to use")
  .option("--no-tmux", "Run directly instead of in tmux pane")
  .action(async (canvasId: string, options: {
    scenario: string;
    config?: string;
    implementation?: string;
    tmux: boolean;
  }) => {
    const registry = await loadRegistry(CANVASES_DIR);
    const entry = registry.get(canvasId);
    
    if (!entry) {
      console.error(`Canvas not found: ${canvasId}`);
      process.exit(1);
    }
    
    const { manifest, path: canvasPath } = entry;
    
    // Determine implementation
    const implName = options.implementation || manifest.defaultImplementation;
    const implementation = manifest.implementations[implName];
    
    if (!implementation) {
      console.error(`Implementation not found: ${implName}`);
      console.error(`Available: ${Object.keys(manifest.implementations).join(", ")}`);
      process.exit(1);
    }
    
    // Validate scenario
    const scenario = options.scenario === "default" 
      ? Object.keys(manifest.scenarios)[0] 
      : options.scenario;
      
    if (!manifest.scenarios[scenario]) {
      console.error(`Scenario not found: ${scenario}`);
      console.error(`Available: ${Object.keys(manifest.scenarios).join(", ")}`);
      process.exit(1);
    }
    
    // Parse config
    let config: unknown;
    if (options.config) {
      try {
        config = JSON.parse(options.config);
      } catch (e) {
        console.error("Invalid config JSON:", e);
        process.exit(1);
      }
    }
    
    // Generate instance ID
    const instanceId = `${canvasId}-${Date.now()}`;
    const socketPath = `/tmp/canvas-${instanceId}.sock`;
    
    console.log(`Spawning ${manifest.name} (${implName})...`);
    console.log(`  Scenario: ${scenario}`);
    console.log(`  Framework: ${implementation.framework}`);
    
    const result = await spawnCanvas({
      manifest,
      implementation,
      canvasPath,
      scenario,
      config,
      instanceId,
      socketPath,
      useTmux: options.tmux && !!process.env.TMUX,
    });
    
    if (result.success) {
      console.log(`Canvas spawned successfully`);
      if (result.paneId) {
        console.log(`  Pane: ${result.paneId}`);
      }
    } else {
      console.error(`Failed to spawn canvas: ${result.error}`);
      process.exit(1);
    }
  });

// Environment check
program
  .command("env")
  .description("Check terminal environment")
  .action(() => {
    console.log("\nTUI Canvas Environment:\n");
    console.log(`  tmux: ${process.env.TMUX ? "yes" : "no"}`);
    if (process.env.TMUX) {
      console.log(`  TMUX: ${process.env.TMUX}`);
      console.log(`  TMUX_PANE: ${process.env.TMUX_PANE || "unknown"}`);
    }
    console.log(`  TERM: ${process.env.TERM}`);
    console.log(`  Canvases dir: ${CANVASES_DIR}`);
  });

// Cleanup orphaned canvas panes
program
  .command("cleanup")
  .description("Find and close orphaned canvas panes")
  .option("--dry-run", "Show what would be cleaned up without actually doing it")
  .action(async (options: { dryRun?: boolean }) => {
    console.log("\nScanning for orphaned canvas panes...\n");
    
    const result = await cleanupOrphanedPanes(options.dryRun);
    
    if (result.found.length === 0) {
      console.log("No orphaned canvas panes found.");
    } else {
      console.log(`Found ${result.found.length} orphaned pane(s):`);
      for (const pane of result.found) {
        console.log(`  ${pane.id} - ${pane.reason}`);
      }
      
      if (options.dryRun) {
        console.log("\n(Dry run - no panes were closed)");
      } else {
        console.log(`\nClosed ${result.closed} pane(s).`);
      }
    }
  });

// Show current canvas pane status
program
  .command("status")
  .description("Show current canvas pane status")
  .action(async () => {
    const info = await getCanvasPaneInfo();
    
    console.log("\nCanvas Pane Status:\n");
    console.log(`  Scope: ${info.scope}`);
    console.log(`  Pane file: ${info.paneFile}`);
    console.log(`  Current pane: ${info.currentPaneId || "(none)"}`);
    console.log(`  Pane exists: ${info.paneExists ? "yes" : "no"}`);
    console.log(`  Pane owned: ${info.paneOwned ? "yes" : "no"}`);
    
    if (info.allCanvasPanes.length > 0) {
      console.log(`\nAll canvas panes in session:`);
      for (const pane of info.allCanvasPanes) {
        const marker = pane.id === info.currentPaneId ? " (current)" : "";
        const owned = pane.owned ? " [owned]" : " [orphaned]";
        console.log(`  ${pane.id}${marker}${owned}`);
      }
    }
  });

program.parse();
