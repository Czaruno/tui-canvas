#!/usr/bin/env bun
/**
 * Document Canvas - OpenTUI Implementation Entry Point
 */

declare const process: any;

import { runDocument } from "./index.tsx";

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

const instanceId = values["instance-id"] ?? values.id ?? `document-${Date.now()}`;
const scenario = values.scenario ?? "display";
const socketPath = values.socket;

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

runDocument({
  id: instanceId,
  socketPath,
  scenario,
  config: config as any,
});
