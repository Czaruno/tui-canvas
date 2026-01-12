# Contributing to TUI Canvas

Thanks for your interest in contributing! This project welcomes improvements to the CLI, MCP server, IPC protocol, and canvas implementations.

## Getting Started

1. Install dependencies: `bun install`
2. Explore available canvases: `bun run packages/cli/src/index.ts list`
3. Spawn a canvas (tmux required): `bun run packages/cli/src/index.ts spawn calendar`

## Development Workflow

- Keep changes focused and consistent with existing patterns.
- Prefer updating existing files over adding new ones.
- Avoid committing local-only files like `session-state.md` or `docs/sessions/`.
- When updating IPC behavior, verify both controller and canvas flows.

## Testing

No automated test suite is configured yet. If you add a test harness, keep it scoped and document how to run it.

## Reporting Issues

Include:
- The harness used (OpenCode, Claude Code, Cursor, Gemini CLI, Grok CLI)
- The canvas and scenario
- Your tmux version and terminal
- Steps to reproduce

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
