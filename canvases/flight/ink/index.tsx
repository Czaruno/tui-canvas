#!/usr/bin/env bun
/**
 * Flight Canvas - Ink Implementation Entry Point
 * 
 * This is the CLI entry point for the Ink-based flight canvas.
 * It parses arguments and renders the flight component.
 */

import React from "react";
import { render } from "ink";
import { parseArgs } from "util";

// Import the flight component from the core package
import { FlightCanvas } from "../../../packages/core/src/canvases/flight.js";

// Parse command line arguments
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    id: { type: "string", default: `flight-${Date.now()}` },
    socket: { type: "string" },
    scenario: { type: "string", default: "default" },
    "config-file": { type: "string" },
    config: { type: "string" },
  },
  allowPositionals: true,
});

// Load config from file or inline
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

// Render the flight canvas
const { waitUntilExit } = render(
  <FlightCanvas
    id={values.id!}
    config={config as any}
    socketPath={values.socket}
  />
);

await waitUntilExit();
