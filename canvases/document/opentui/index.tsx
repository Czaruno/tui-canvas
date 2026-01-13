#!/usr/bin/env bun
/**
 * Document Canvas - OpenTUI/Solid Implementation
 */

declare const process: any;

import { render } from "@opentui/solid";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { connectWithRetry, type IPCClient } from "../../../packages/core/src/ipc/client";
import type { ControllerMessage } from "../../../packages/core/src/ipc/types";
import type {
  DocumentConfig,
  DocumentSelection,
  EmailConfig,
} from "../../../packages/core/src/canvases/document/types";

interface DocumentAppProps {
  id: string;
  socketPath?: string;
  scenario: string;
  config?: DocumentConfig;
}

interface LineSegment {
  text: string;
  fg?: string;
  bg?: string;
}

const DEFAULT_CONTENT = "# Welcome\n\nNo content provided.";
const SELECTION_BG = "#2563EB";
const CURSOR_BG = "#22D3EE";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeKey(data: string): string | null {
  if (data === "\u0003") return "ctrl-c";
  if (data === "\u001b") return "escape";
  if (data === "\r" || data === "\n") return "enter";
  if (data === "\u001b[A") return "up";
  if (data === "\u001b[B") return "down";
  if (data === "\u001b[C") return "right";
  if (data === "\u001b[D") return "left";
  if (data === "\u001b[5~") return "pageup";
  if (data === "\u001b[6~") return "pagedown";
  if (data === "\u001b[H") return "home";
  if (data === "\u001b[F") return "end";
  return data;
}

function useKeyboard(handler: (key: string) => void) {
  onMount(() => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (data: string) => {
      const key = normalizeKey(data);
      if (key) handler(key);
    };

    stdin.on("data", onData);

    onCleanup(() => {
      stdin.off("data", onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    });
  });
}

function useStdoutDimensions() {
  const [dimensions, setDimensions] = createSignal({
    width: process.stdout.columns || 120,
    height: process.stdout.rows || 40,
  });

  onMount(() => {
    const update = () => {
      setDimensions({
        width: process.stdout.columns || 120,
        height: process.stdout.rows || 40,
      });
    };

    process.stdout.on("resize", update);
    update();

    onCleanup(() => {
      process.stdout.off("resize", update);
    });
  });

  return dimensions;
}

function DocumentApp(props: DocumentAppProps) {
  const [config, setConfig] = createSignal<DocumentConfig>({
    ...(props.config || {}),
    content: props.config?.content ?? DEFAULT_CONTENT,
  });
  const [content, setContent] = createSignal(config().content ?? DEFAULT_CONTENT);
  const [cursorLine, setCursorLine] = createSignal(0);
  const [cursorCol, setCursorCol] = createSignal(0);
  const [scrollOffset, setScrollOffset] = createSignal(0);
  const [selectionAnchor, setSelectionAnchor] = createSignal<number | null>(null);
  const dimensions = useStdoutDimensions();

  const isEmailPreview = createMemo(() => props.scenario === "email-preview");
  const isEditable = createMemo(
    () => props.scenario === "edit" && !config().readOnly
  );

  const lines = createMemo(() => content().split("\n"));
  const lineOffsets = createMemo(() => {
    const offsets: number[] = [];
    let offset = 0;
    for (const line of lines()) {
      offsets.push(offset);
      offset += line.length + 1;
    }
    return offsets;
  });

  const headerLines = createMemo(() => {
    let count = 2;
    if (isEmailPreview()) {
      const emailConfig = config() as EmailConfig;
      count += 2; // From, To
      if (emailConfig.cc && emailConfig.cc.length > 0) count += 1;
      if (emailConfig.bcc && emailConfig.bcc.length > 0) count += 1;
      count += 2; // Subject + divider
    }
    return count;
  });

  const footerHeight = 1;
  const viewportHeight = createMemo(() =>
    Math.max(1, dimensions().height - headerLines() - footerHeight - 2)
  );
  const maxScroll = createMemo(() =>
    Math.max(0, lines().length - viewportHeight())
  );
  const contentWidth = createMemo(() => Math.max(20, dimensions().width - 4));

  const selectionRange = createMemo(() => {
    if (!isEditable()) return null;
    const anchor = selectionAnchor();
    if (anchor === null) return null;
    const cursorOffset = offsetForPosition(cursorLine(), cursorCol());
    if (anchor === cursorOffset) return null;
    return {
      start: Math.min(anchor, cursorOffset),
      end: Math.max(anchor, cursorOffset),
    };
  });

  const resetSelection = () => {
    setSelectionAnchor(null);
  };

  const offsetForPosition = (lineIndex: number, columnIndex: number) => {
    const currentLines = lines();
    const line = currentLines[lineIndex] ?? "";
    const lineOffset = lineOffsets()[lineIndex] ?? 0;
    const clampedCol = clamp(columnIndex, 0, line.length);
    return lineOffset + clampedCol;
  };

  const positionForOffset = (offset: number) => {
    const currentLines = lines();
    let remaining = offset;
    for (let i = 0; i < currentLines.length; i++) {
      const lineLength = currentLines[i]?.length ?? 0;
      if (remaining <= lineLength) {
        return { line: i, column: remaining };
      }
      remaining -= lineLength + 1;
    }
    const lastLine = Math.max(0, currentLines.length - 1);
    return {
      line: lastLine,
      column: currentLines[lastLine]?.length ?? 0,
    };
  };

  const getSelectionData = (): DocumentSelection | null => {
    const selection = selectionRange();
    if (!selection) return null;
    const startPosition = positionForOffset(selection.start);
    const endPosition = positionForOffset(selection.end);
    return {
      selectedText: content().slice(selection.start, selection.end),
      startOffset: selection.start,
      endOffset: selection.end,
      startLine: startPosition.line + 1,
      endLine: endPosition.line + 1,
      startColumn: startPosition.column + 1,
      endColumn: endPosition.column + 1,
    };
  };

  const ensureCursorVisible = (line: number) => {
    const viewHeight = viewportHeight();
    const currentScroll = scrollOffset();
    if (line < currentScroll) {
      setScrollOffset(line);
    } else if (line >= currentScroll + viewHeight) {
      setScrollOffset(Math.max(0, line - viewHeight + 1));
    }
  };

  const updateCursor = (line: number, column: number) => {
    const currentLines = lines();
    const maxLine = Math.max(0, currentLines.length - 1);
    const nextLine = clamp(line, 0, maxLine);
    const maxColumn = currentLines[nextLine]?.length ?? 0;
    const nextColumn = clamp(column, 0, maxColumn);
    setCursorLine(nextLine);
    setCursorCol(nextColumn);
    ensureCursorVisible(nextLine);
  };

  const scrollBy = (delta: number) => {
    setScrollOffset((prev: number) => clamp(prev + delta, 0, maxScroll()));
  };

  const toggleSelection = () => {
    if (!isEditable()) return;
    const anchor = selectionAnchor();
    if (anchor === null) {
      setSelectionAnchor(offsetForPosition(cursorLine(), cursorCol()));
    } else {
      resetSelection();
    }
  };

  const exitCanvas = (code = 0) => {
    ipcClient?.close();
    process.exit(code);
  };

  const sendSelected = (data: DocumentSelection) => {
    ipcClient?.send({ type: "selected", data });
  };

  const sendCancelled = (reason?: string) => {
    ipcClient?.send({ type: "cancelled", reason });
  };

  const sendSelectionSnapshot = () => {
    ipcClient?.send({ type: "selection", data: getSelectionData() });
  };

  const sendContentSnapshot = () => {
    ipcClient?.send({
      type: "content",
      data: {
        content: content(),
        cursorPosition: offsetForPosition(cursorLine(), cursorCol()),
      },
    });
  };

  let ipcClient: IPCClient | null = null;

  onMount(() => {
    if (!props.socketPath) return;

    connectWithRetry({
      socketPath: props.socketPath,
      onMessage: (message: ControllerMessage) => {
        switch (message.type) {
          case "close":
            exitCanvas(0);
            break;
          case "update":
            if (message.config && typeof message.config === "object") {
              setConfig(message.config as DocumentConfig);
            }
            break;
          case "ping":
            ipcClient?.send({ type: "pong" });
            break;
          case "getSelection":
            sendSelectionSnapshot();
            break;
          case "getContent":
            sendContentSnapshot();
            break;
        }
      },
      onDisconnect: () => {
        ipcClient = null;
      },
      onError: (err) => {
        console.error("IPC error:", err);
      },
    })
      .then((client) => {
        ipcClient = client;
        ipcClient.send({ type: "ready", scenario: props.scenario });
      })
      .catch((err) => {
        console.error("Failed to connect to controller:", err);
      });

    onCleanup(() => {
      ipcClient?.close();
    });
  });

  createEffect(() => {
    const newContent = config().content ?? DEFAULT_CONTENT;
    setContent(newContent);
    updateCursor(cursorLine(), cursorCol());
    setScrollOffset((offset: number) => clamp(offset, 0, maxScroll()));
  });

  useKeyboard((key) => {
    if (key === "ctrl-c" || key === "escape" || key === "q") {
      sendCancelled("User cancelled");
      exitCanvas(0);
      return;
    }

    if (key === "enter") {
      if (isEditable()) {
        const selection = getSelectionData();
        if (selection) {
          sendSelected(selection);
        } else {
          sendCancelled("No selection");
        }
        exitCanvas(0);
      } else {
        exitCanvas(0);
      }
      return;
    }

    if (key === "v") {
      toggleSelection();
      return;
    }

    if (key === "pageup") {
      scrollBy(-viewportHeight());
      return;
    }

    if (key === "pagedown") {
      scrollBy(viewportHeight());
      return;
    }

    if (key === "home") {
      scrollBy(-maxScroll());
      updateCursor(0, 0);
      return;
    }

    if (key === "end") {
      scrollBy(maxScroll());
      updateCursor(lines().length - 1, cursorCol());
      return;
    }

    if (key === "up") {
      if (isEditable()) {
        updateCursor(cursorLine() - 1, cursorCol());
      } else {
        scrollBy(-1);
      }
      return;
    }

    if (key === "down") {
      if (isEditable()) {
        updateCursor(cursorLine() + 1, cursorCol());
      } else {
        scrollBy(1);
      }
      return;
    }

    if (key === "left" && isEditable()) {
      updateCursor(cursorLine(), cursorCol() - 1);
      return;
    }

    if (key === "right" && isEditable()) {
      updateCursor(cursorLine(), cursorCol() + 1);
      return;
    }
  });

  const visibleLines = createMemo(() => {
    const start = scrollOffset();
    const end = start + viewportHeight();
    return lines().slice(start, end);
  });

  const buildSegments = (lineText: string, lineIndex: number): LineSegment[] => {
    const width = contentWidth();
    let text = lineText.slice(0, width);
    const selection = selectionRange();
    const showCursor = isEditable() && selectionAnchor() === null;

    if (showCursor && cursorLine() === lineIndex) {
      const cursorIndex = cursorCol();
      if (cursorIndex >= text.length) {
        text = text + " ";
      }
    }

    const segments: LineSegment[] = [];
    const lineOffset = lineOffsets()[lineIndex] ?? 0;

    if (selection) {
      const selectionStart = clamp(selection.start - lineOffset, 0, text.length);
      const selectionEnd = clamp(selection.end - lineOffset, 0, text.length);
      if (selectionEnd <= 0 || selectionStart >= text.length || selectionStart === selectionEnd) {
        segments.push({ text });
      } else {
        segments.push({ text: text.slice(0, selectionStart) });
        segments.push({
          text: text.slice(selectionStart, selectionEnd),
          fg: "#FFFFFF",
          bg: SELECTION_BG,
        });
        segments.push({ text: text.slice(selectionEnd) });
      }
    } else if (showCursor && cursorLine() === lineIndex) {
      const cursorIndex = clamp(cursorCol(), 0, text.length);
      segments.push({ text: text.slice(0, cursorIndex) });
      const cursorChar = text[cursorIndex] ?? " ";
      segments.push({ text: cursorChar, fg: "#000000", bg: CURSOR_BG });
      segments.push({ text: text.slice(cursorIndex + 1) });
    } else {
      segments.push({ text });
    }

    return segments;
  };

  const title = createMemo(() => {
    if (config().title) return config().title;
    return isEmailPreview() ? "Email Preview" : "Document";
  });

  const subtitle = createMemo(() => {
    if (isEditable()) return "Framework: OpenTUI • v select • Enter confirm • q cancel";
    return "Framework: OpenTUI • q quit";
  });

  const footer = createMemo(() => {
    if (isEditable()) return "↑↓←→ move • v select • Enter confirm • q cancel";
    return "↑↓ scroll • q quit";
  });

  return (
    <box flexDirection="column" width="100%" height="100%" paddingLeft={1} paddingRight={1}>
      <box flexDirection="column" marginBottom={1}>
        <text fg="#FFFFFF">{title()}</text>
        <text fg="#6B7280">{subtitle()}</text>
        <Show when={isEmailPreview()}>
          <box flexDirection="column" marginTop={1}>
            <text fg="#9CA3AF">From: {(config() as EmailConfig).from || ""}</text>
            <text fg="#9CA3AF">
              To: {((config() as EmailConfig).to || []).join(", ")}
            </text>
            <Show when={(config() as EmailConfig).cc && (config() as EmailConfig).cc!.length > 0}>
              <text fg="#9CA3AF">Cc: {((config() as EmailConfig).cc || []).join(", ")}</text>
            </Show>
            <Show when={(config() as EmailConfig).bcc && (config() as EmailConfig).bcc!.length > 0}>
              <text fg="#9CA3AF">Bcc: {((config() as EmailConfig).bcc || []).join(", ")}</text>
            </Show>
            <text fg="#9CA3AF">Subject: {(config() as EmailConfig).subject || ""}</text>
            <text fg="#374151">{"─".repeat(Math.max(10, contentWidth()))}</text>
          </box>
        </Show>
      </box>

      <box flexDirection="column" flexGrow={1}>
        <For each={visibleLines()}>
          {(line, index) => {
            const lineIndex = scrollOffset() + index();
            const segments = buildSegments(line, lineIndex);
            return (
              <box height={1}>
                <For each={segments}>
                  {(segment) => (
                    <text fg={segment.fg} bg={segment.bg}>
                      {segment.text}
                    </text>
                  )}
                </For>
              </box>
            );
          }}
        </For>
      </box>

      <box marginTop={1}>
        <text fg="#6B7280">{footer()}</text>
      </box>
    </box>
  );
}

export function runDocument(props: DocumentAppProps) {
  render(() => <DocumentApp {...props} />, { useThread: false });
}
