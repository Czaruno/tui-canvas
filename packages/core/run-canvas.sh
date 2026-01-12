#!/bin/bash
# Wrapper script to run OpenCode Canvas with proper environment
# Note: We don't use 'exec' so that a shell remains after the canvas exits,
# allowing the pane to be reused for subsequent canvas spawns.
cd "$(dirname "$0")"
bun run src/cli.ts "$@"
