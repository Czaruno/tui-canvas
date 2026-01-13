#!/usr/bin/env bun
/**
 * Calendar Canvas - OpenTUI Implementation Entry Point
 */

declare const process: any;
declare const Bun: any;

import { runCalendar } from "./index.tsx";

const args = process.argv.slice(2);
const values: Record<string, string> = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = args[i + 1];
  if (next && !next.startsWith("--")) {
    values[key] = next;
    i++;
  } else {
    values[key] = "true";
  }
}

const instanceId = values["instance-id"] ?? values.id ?? `calendar-${Date.now()}`;
const scenario = values.scenario ?? "display";
const socketPath = values.socket;

// Debug logging
import { appendFileSync } from "fs";
try {
  appendFileSync("/tmp/canvas-debug.log", `[${new Date().toISOString()}] Canvas starting\n`);
  appendFileSync("/tmp/canvas-debug.log", `  instanceId: ${instanceId}\n`);
  appendFileSync("/tmp/canvas-debug.log", `  scenario: ${scenario}\n`);
  appendFileSync("/tmp/canvas-debug.log", `  socketPath: ${socketPath}\n`);
  appendFileSync("/tmp/canvas-debug.log", `  values: ${JSON.stringify(values)}\n`);
} catch {}

let config: Record<string, unknown> = {};
if (values["config-file"]) {
  try {
    const file = Bun.file(values["config-file"]);
    config = await file.json();
  } catch (e) {
    console.error("Failed to load config file:", e);
  }
} else if (values.config) {
  try {
    config = JSON.parse(values.config);
  } catch (e) {
    console.error("Failed to parse config:", e);
  }
}

runCalendar({
  id: instanceId,
  socketPath,
  scenario,
  config,
});
