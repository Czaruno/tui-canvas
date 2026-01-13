#!/usr/bin/env bun
/**
 * Flight Canvas - OpenTUI/Solid Implementation
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
import { useIPC } from "../../../packages/core/src/ipc/use-ipc-solid";
import type {
  Flight,
  FlightConfig,
  FlightResult,
  Seatmap,
} from "../../../packages/core/src/canvases/flight/types";
import {
  buildSeat,
  CYBER_COLORS,
  formatDuration,
  formatPrice,
  formatTime,
} from "../../../packages/core/src/canvases/flight/types";

interface FlightAppProps {
  id: string;
  socketPath?: string;
  scenario: string;
  config?: FlightConfig;
}

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

function FlightApp(props: FlightAppProps) {
  const [config, setConfig] = createSignal<FlightConfig>({
    flights: props.config?.flights ?? [],
    title: props.config?.title,
    showSeatmap: props.config?.showSeatmap,
    selectedFlightId: props.config?.selectedFlightId,
  });
  const [selectedFlightIndex, setSelectedFlightIndex] = createSignal(0);
  const [selectedSeat, setSelectedSeat] = createSignal<string | null>(null);
  const [focusMode, setFocusMode] = createSignal<"flights" | "seatmap">("flights");
  const [seatCursorRow, setSeatCursorRow] = createSignal(1);
  const [seatCursorCol, setSeatCursorCol] = createSignal(0);
  const dimensions = useStdoutDimensions();
  const [lastSelection, setLastSelection] = createSignal<FlightResult | null>(null);

  const flights = createMemo<Flight[]>(() => config().flights ?? []);
  const selectedFlight = createMemo(() => flights()[selectedFlightIndex()]);
  const seatmap = createMemo(() => selectedFlight()?.seatmap);
  const seatmapEnabled = createMemo(
    () => !!seatmap() && config().showSeatmap !== false
  );

  const title = createMemo(() => config().title ?? "Flight Booking");

  const subtitle = createMemo(() => {
    return seatmapEnabled()
      ? "Framework: OpenTUI • Tab switch • Enter select • q cancel"
      : "Framework: OpenTUI • Enter select • q cancel";
  });

  const footer = createMemo(() => {
    if (seatmapEnabled()) {
      return focusMode() === "flights"
        ? "↑↓ flight • Enter seat • Tab seatmap • s skip • q cancel"
        : "↑↓←→ seat • Enter confirm • Tab flights • s skip • q cancel";
    }
    return "↑↓ flight • Enter confirm • q cancel";
  });

  const seatmapWindow = createMemo(() => {
    const currentSeatmap = seatmap();
    if (!currentSeatmap) {
      return { start: 1, rows: [] as number[] };
    }
    const windowSize = Math.max(6, Math.min(12, dimensions().height - 18));
    const cursor = seatCursorRow();
    let start = Math.max(1, cursor - Math.floor(windowSize / 2));
    let end = Math.min(currentSeatmap.rows, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    const rows = [] as number[];
    for (let row = start; row <= end; row++) rows.push(row);
    return { start, rows };
  });

  const getSeatStatus = (seatmapData: Seatmap, row: number, letter: string) => {
    const seat = buildSeat(row, letter);
    if (selectedSeat() === seat) return "selected";
    if (seatmapData.occupied.includes(seat)) return "occupied";
    if (seatmapData.unavailable.includes(seat)) return "unavailable";
    if (seatmapData.premium.includes(seat)) return "premium";
    return "available";
  };

  const getSeatColors = (status: string) => {
    switch (status) {
      case "selected":
        return { fg: "black", bg: "cyan" };
      case "occupied":
        return { fg: "white", bg: "red" };
      case "unavailable":
        return { fg: "white", bg: "red" };
      case "premium":
        return { fg: "black", bg: "yellow" };
      default:
        return { fg: "white", bg: undefined };
    }
  };

  const exitCanvas = (code = 0) => {
    process.exit(code);
  };
  
  // IPC for communicating with controller (canvas connects as client to controller server)
  const ipc = useIPC({
    socketPath: props.socketPath,
    scenario: props.scenario || "booking",
    onClose: () => exitCanvas(0),
    onUpdate: (newConfig: unknown) => {
      setConfig(newConfig as FlightConfig);
    },
    // Flight doesn't have text selection, so no onGetSelection callback
  });

  const confirmFlight = (seatOverride?: string) => {
    const flight = selectedFlight();
    if (!flight) return;
    const result: FlightResult = {
      selectedFlight: flight,
      selectedSeat: seatOverride ?? selectedSeat() ?? undefined,
    };
    setLastSelection(result);
    ipc.sendSelected(result);
    exitCanvas(0);
  };

  const confirmSeat = () => {
    const currentSeatmap = seatmap();
    if (!currentSeatmap) return;
    const letter = currentSeatmap.seatsPerRow[seatCursorCol()];
    if (!letter) return;
    const seat = buildSeat(seatCursorRow(), letter);
    const status = getSeatStatus(currentSeatmap, seatCursorRow(), letter);
    if (status === "occupied" || status === "unavailable") return;
    setSelectedSeat(seat);
    confirmFlight(seat);
  };

  createEffect(() => {
    const flightList = flights();
    if (config().selectedFlightId) {
      const match = flightList.findIndex(
        (flight: Flight) => flight.id === config().selectedFlightId
      );
      if (match >= 0) {
        setSelectedFlightIndex(match);
      }
    } else {
      setSelectedFlightIndex((prev: number) => clamp(prev, 0, Math.max(0, flightList.length - 1)));
    }
    if (!seatmapEnabled()) {
      setFocusMode("flights");
    }
  });

  const moveFlight = (delta: number) => {
    const maxIndex = Math.max(0, flights().length - 1);
    setSelectedFlightIndex((prev: number) => clamp(prev + delta, 0, maxIndex));
  };

  const moveSeatCursor = (rowDelta: number, colDelta: number) => {
    const currentSeatmap = seatmap();
    if (!currentSeatmap) return;
    const maxRow = currentSeatmap.rows;
    const maxCol = currentSeatmap.seatsPerRow.length - 1;
    setSeatCursorRow((prev: number) => clamp(prev + rowDelta, 1, maxRow));
    setSeatCursorCol((prev: number) => clamp(prev + colDelta, 0, maxCol));
  };



  useKeyboard((key) => {
    if (key === "ctrl-c" || key === "escape" || key === "q") {
      ipc.sendCancelled("User cancelled");
      exitCanvas(0);
      return;
    }

    if (key === "tab" && seatmapEnabled()) {
      setFocusMode((mode: "flights" | "seatmap") => (mode === "flights" ? "seatmap" : "flights"));
      return;
    }

    if (key === "s") {
      confirmFlight();
      return;
    }

    if (focusMode() === "flights") {
      if (key === "up") moveFlight(-1);
      if (key === "down") moveFlight(1);
      if (key === "enter") {
        if (seatmapEnabled()) {
          setFocusMode("seatmap");
        } else {
          confirmFlight();
        }
      }
      return;
    }

    if (focusMode() === "seatmap") {
      if (key === "up") moveSeatCursor(-1, 0);
      if (key === "down") moveSeatCursor(1, 0);
      if (key === "left") moveSeatCursor(0, -1);
      if (key === "right") moveSeatCursor(0, 1);
      if (key === "enter") confirmSeat();
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%" paddingLeft={1} paddingRight={1}>
      <box flexDirection="column" marginBottom={1}>
        <text fg="#FFFFFF">{title()}</text>
        <text fg="#6B7280">{subtitle()}</text>
      </box>

      <Show when={flights().length > 0} fallback={<text fg="#9CA3AF">No flights provided.</text>}>
        <box flexDirection="column">
          <For each={flights()}>
            {(flight: Flight, index: () => number) => {
              const isSelected = index() === selectedFlightIndex();
              return (
                <box height={1}>
                  <text fg={isSelected ? CYBER_COLORS.neonCyan : CYBER_COLORS.dim}>
                    {isSelected ? "> " : "  "}
                    {flight.airline} {flight.flightNumber} • {flight.origin.code}→{flight.destination.code} •
                    {" "}{formatTime(flight.departureTime)}-{formatTime(flight.arrivalTime)} •
                    {" "}{formatDuration(flight.duration)} •
                    {" "}{formatPrice(flight.price, flight.currency)}
                  </text>
                </box>
              );
            }}
          </For>
        </box>

        <Show when={selectedFlight()}>
          {(flight: () => Flight) => (
            <box flexDirection="column" marginTop={1}>
              <text fg="#9CA3AF">
                {flight().origin.city} → {flight().destination.city} • {flight().stops === 0 ? "Nonstop" : `${flight().stops} stops`}
              </text>
              <text fg="#9CA3AF">Cabin: {flight().cabinClass} • Aircraft: {flight().aircraft || "TBD"}</text>
              <Show when={selectedSeat()}>
                <text fg={CYBER_COLORS.neonGreen}>Seat: {selectedSeat()}</text>
              </Show>
            </box>
          )}
        </Show>

        <Show when={seatmapEnabled() && seatmap()}>
          {(seatmapData: () => Seatmap) => (
            <box flexDirection="column" marginTop={1}>
              <text fg="#9CA3AF">Seatmap (focus: {focusMode()})</text>
              <For each={seatmapWindow().rows}>
                {(row: number) => (
                  <box height={1}>
                    <text fg="#6B7280">{String(row).padStart(2, "0")} </text>
                    <For each={seatmapData().seatsPerRow}>
                      {(letter: string) => {
                        const status = getSeatStatus(seatmapData(), row, letter);
                        const colors = getSeatColors(status);
                        const isCursor = focusMode() === "seatmap" && row === seatCursorRow() && letter === seatmapData().seatsPerRow[seatCursorCol()];
                        const seatLabel = isCursor ? `[${letter}]` : ` ${letter} `;
                        return (
                          <text fg={colors.fg} bg={colors.bg}>{seatLabel}</text>
                        );
                      }}
                    </For>
                  </box>
                )}
              </For>
              <text fg="#6B7280">
                Available • Premium • Occupied • Unavailable • Selected
              </text>
            </box>
          )}
        </Show>
      </Show>

      <box marginTop={1}>
        <text fg="#6B7280">{footer()}</text>
      </box>
    </box>
  );
}

export function runFlight(props: FlightAppProps) {
  // Call FlightApp directly (not via JSX) to ensure hooks run synchronously
  // This is necessary because OpenTUI's render might not trigger Solid.js lifecycle properly
  render(() => FlightApp(props), { useThread: false });
}
