/**
 * Canvas Registry
 * 
 * Discovers and manages canvas manifests.
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type {
  CanvasManifest,
  CanvasRegistry,
  CanvasRegistryEntry,
} from "@tui-canvas/protocol";

// Re-export types for consumers
export type { CanvasRegistry, CanvasRegistryEntry, CanvasManifest };

class Registry implements CanvasRegistry {
  private canvases = new Map<string, CanvasRegistryEntry>();

  list(): CanvasRegistryEntry[] {
    return Array.from(this.canvases.values());
  }

  get(id: string): CanvasRegistryEntry | undefined {
    return this.canvases.get(id);
  }

  register(entry: CanvasRegistryEntry): void {
    this.canvases.set(entry.manifest.id, entry);
  }

  async discover(path: string): Promise<CanvasRegistryEntry[]> {
    const entries: CanvasRegistryEntry[] = [];
    
    try {
      const dirs = await readdir(path, { withFileTypes: true });
      
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        
        const manifestPath = join(path, dir.name, "manifest.json");
        
        try {
          const content = await readFile(manifestPath, "utf-8");
          const manifest = JSON.parse(content) as CanvasManifest;
          
          const entry: CanvasRegistryEntry = {
            manifest,
            path: join(path, dir.name),
            builtin: true,
          };
          
          entries.push(entry);
          this.register(entry);
        } catch {
          // Skip directories without valid manifests
        }
      }
    } catch (e) {
      console.error(`Failed to discover canvases in ${path}:`, e);
    }
    
    return entries;
  }
}

let globalRegistry: Registry | null = null;

export async function loadRegistry(canvasesDir: string): Promise<CanvasRegistry> {
  if (!globalRegistry) {
    globalRegistry = new Registry();
    await globalRegistry.discover(canvasesDir);
  }
  return globalRegistry;
}

export async function discoverCanvases(path: string): Promise<CanvasRegistryEntry[]> {
  const registry = new Registry();
  return registry.discover(path);
}
