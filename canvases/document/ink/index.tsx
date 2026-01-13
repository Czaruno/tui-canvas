#!/usr/bin/env bun
/**
 * Document Canvas - Ink Implementation Entry Point
 * 
 * This is the CLI entry point for the Ink-based document canvas.
 * It parses arguments and renders the document component.
 */

import React from "react";
import { render } from "ink";
import { parseArgs } from "util";

// Import the document component (self-contained in this directory)
import { Document } from "./document";

// Parse command line arguments
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    id: { type: "string", default: `document-${Date.now()}` },
    socket: { type: "string" },
    scenario: { type: "string", default: "display" },
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

// Render the document
const { waitUntilExit } = render(
  <Document
    id={values.id!}
    scenario={values.scenario!}
    config={config}
    socketPath={values.socket}
  />
);

await waitUntilExit();
