// Flight Booking Canvas - Cyberpunk-themed flight comparison and seat selection

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { useIPC } from "../../calendar/ink/hooks/use-ipc";
import { useMouse, type MouseEvent } from "../../calendar/ink/hooks/use-mouse";
import {
  type FlightConfig,
  type FlightResult,
  type Flight,
  type FocusMode,
  CYBER_COLORS,
  formatPrice,
  formatDuration,
  formatTime,
  buildSeat,
} from "./types";

// Import subcomponents
import { CyberpunkHeader } from "./components/cyberpunk-header";
import { FlightList } from "./components/flight-list";
import { RouteDisplay } from "./components/route-display";
import { FlightInfo } from "./components/flight-info";
import { SeatmapPanel } from "./components/seatmap-panel";
import { StatusBar } from "./components/status-bar";

interface Props {
  id: string;
  config?: FlightConfig;
  socketPath?: string;
  scenario?: string;
}

export function FlightCanvas({
  id,
  config: initialConfig,
  socketPath,
  scenario = "booking",
}: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal dimensions
  const [dimensions, setDimensions] = useState({
    width: stdout?.columns || 120,
    height: stdout?.rows || 40,
  });

  // Config (can be updated via IPC)
  const [config, setConfig] = useState<FlightConfig | undefined>(initialConfig);

  // Selection state
  const [selectedFlightIndex, setSelectedFlightIndex] = useState(0);
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<FocusMode>("flights");

  // Seatmap cursor position
  const [seatCursorRow, setSeatCursorRow] = useState(1);
  const [seatCursorCol, setSeatCursorCol] = useState(0);

  // Hover state for mouse
  const [hoveredSeat, setHoveredSeat] = useState<string | null>(null);

  // Countdown state for confirmation
  const [countdown, setCountdown] = useState<number | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const spinnerChars = ["|", "/", "-", "\\"];

  // IPC connection
  const ipc = useIPC({
    socketPath,
    scenario,
    onClose: () => exit(),
    onUpdate: (newConfig) => {
      setConfig(newConfig as FlightConfig);
    },
  });

  // Get current flights
  const flights = config?.flights || [];
  const selectedFlight = flights[selectedFlightIndex];
  const seatmap = selectedFlight?.seatmap;

  // Listen for terminal resize
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: stdout?.columns || 120,
        height: stdout?.rows || 40,
      });
    };
    stdout?.on("resize", updateDimensions);
    updateDimensions();
    return () => {
      stdout?.off("resize", updateDimensions);
    };
  }, [stdout]);

  // Countdown timer
  useEffect(() => {
    if (countdown === null) return;

    if (countdown === -1) {
      exit();
      return;
    }

    if (countdown === 0) {
      const timer = setTimeout(() => {
        setCountdown(-1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, exit]);

  // Spinner animation
  useEffect(() => {
    if (countdown === null) return;
    const interval = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % spinnerChars.length);
    }, 100);
    return () => clearInterval(interval);
  }, [countdown, spinnerChars.length]);

  // Check if a seat is available
  const isSeatAvailable = useCallback(
    (row: number, letter: string): boolean => {
      if (!seatmap) return false;
      const seat = buildSeat(row, letter);
      if (seatmap.unavailable.includes(seat)) return false;
      if (seatmap.occupied.includes(seat)) return false;
      return true;
    },
    [seatmap]
  );

  // Handle final selection
  // Pass seat directly to avoid race condition with state updates
  const handleConfirm = useCallback(
    (skipCountdown: boolean = false, seatOverride?: string) => {
      if (!selectedFlight) return;

      const result: FlightResult = {
        selectedFlight,
        selectedSeat: seatOverride || selectedSeat || undefined,
      };

      ipc.sendSelected(result);

      if (skipCountdown) {
        setCountdown(0);
      } else {
        setCountdown(3);
      }
    },
    [selectedFlight, selectedSeat, ipc]
  );

  // Keyboard controls
  useInput((input, key) => {
    // Cancel/quit
    if (input === "q" || key.escape) {
      if (countdown !== null) {
        setCountdown(null);
      } else {
        ipc.sendCancelled("User cancelled");
        exit();
      }
      return;
    }

    // During countdown, only allow cancel
    if (countdown !== null) return;

    // Tab to switch focus
    if (key.tab) {
      if (seatmap) {
        setFocusMode((mode) => (mode === "flights" ? "seatmap" : "flights"));
      }
      return;
    }

    // Enter to confirm
    if (key.return) {
      if (focusMode === "flights" && selectedFlight) {
        if (seatmap && !selectedSeat) {
          // Switch to seatmap to select seat
          setFocusMode("seatmap");
        } else {
          // Confirm selection
          handleConfirm(key.shift);
        }
      } else if (focusMode === "seatmap" && seatmap) {
        const letter = seatmap.seatsPerRow[seatCursorCol];
        if (letter && isSeatAvailable(seatCursorRow, letter)) {
          const seat = buildSeat(seatCursorRow, letter);
          setSelectedSeat(seat);
          // Auto-confirm after seat selection
          handleConfirm(key.shift);
        }
      }
      return;
    }

    // Space to select seat without confirming
    if (input === " " && focusMode === "seatmap" && seatmap) {
      const letter = seatmap.seatsPerRow[seatCursorCol];
      if (letter && isSeatAvailable(seatCursorRow, letter)) {
        const seat = buildSeat(seatCursorRow, letter);
        setSelectedSeat((prev) => (prev === seat ? null : seat));
      }
      return;
    }

    // Navigation
    if (focusMode === "flights") {
      if (key.upArrow) {
        setSelectedFlightIndex((i) => Math.max(0, i - 1));
        setSelectedSeat(null); // Reset seat when changing flight
      } else if (key.downArrow) {
        setSelectedFlightIndex((i) => Math.min(flights.length - 1, i + 1));
        setSelectedSeat(null);
      }
    } else if (focusMode === "seatmap" && seatmap) {
      // Horizontal plane layout: rows go left-right, seat letters go up-down
      if (key.leftArrow) {
        setSeatCursorRow((r) => Math.max(1, r - 1)); // Move toward front of plane
      } else if (key.rightArrow) {
        setSeatCursorRow((r) => Math.min(seatmap.rows, r + 1)); // Move toward back
      } else if (key.upArrow) {
        setSeatCursorCol((c) => Math.max(0, c - 1)); // Move toward window (A)
      } else if (key.downArrow) {
        setSeatCursorCol((c) => Math.min(seatmap.seatsPerRow.length - 1, c + 1)); // Move toward other window (F)
      }
    }
  });

  // Layout calculations (needed for mouse handling)
  const termWidth = dimensions.width;
  const termHeight = dimensions.height;
  const headerHeight = 3;
  const statusBarHeight = 2;
  const contentHeight = termHeight - headerHeight - statusBarHeight;
  const leftPanelWidth = Math.max(24, Math.floor(termWidth * 0.3));
  const rightPanelWidth = termWidth - leftPanelWidth - 4;

  // Mouse click handler
  const handleMouseClick = useCallback(
    (event: MouseEvent) => {
      // During countdown, ignore clicks
      if (countdown !== null) return;

      // Check if click is in left panel (flight list)
      // Left panel: x from 1 to leftPanelWidth, y from headerHeight+1 onwards
      if (event.x >= 1 && event.x <= leftPanelWidth && event.y > headerHeight) {
        // Click in flight list area
        // Panel border (1) + header "[FLIGHTS]" (1) + margin (1) = 3 rows before content
        const panelContentY = event.y - headerHeight - 3;
        if (panelContentY >= 0) {
          const flightCardHeight = 4; // Height of each flight card
          
          // Calculate scroll offset (same logic as FlightList component)
          const maxFlightListHeight = contentHeight - 4;
          const visibleItems = Math.floor(maxFlightListHeight / flightCardHeight);
          let startIndex = 0;
          if (selectedFlightIndex >= visibleItems) {
            startIndex = selectedFlightIndex - visibleItems + 1;
          }
          
          const visibleClickedIndex = Math.floor(panelContentY / flightCardHeight);
          const actualClickedIndex = startIndex + visibleClickedIndex;
          
          if (actualClickedIndex >= 0 && actualClickedIndex < flights.length) {
            // If clicking already selected flight, confirm it
            if (actualClickedIndex === selectedFlightIndex) {
              handleConfirm(event.modifiers.shift);
            } else {
              // Select the flight
              setSelectedFlightIndex(actualClickedIndex);
              setSelectedSeat(null);
              setFocusMode("flights");
            }
          }
        }
        return;
      }

      // Check if click is in right panel (seatmap area if available)
      if (seatmap && event.x > leftPanelWidth) {
        const seatmapHeight = Math.min(14, Math.max(12, Math.floor(contentHeight * 0.45)));
        const seatmapTop = termHeight - statusBarHeight - seatmapHeight;

        if (event.y >= seatmapTop && event.y < termHeight - statusBarHeight) {
          // Click in seatmap area
          setFocusMode("seatmap");
          
          // Calculate which seat was clicked
          const seatmapLeftEdge = leftPanelWidth + 5;
          const relX = event.x - seatmapLeftEdge;
          const seatmapContentTop = seatmapTop + 3;
          const relY = event.y - seatmapContentTop;
          
          if (relX >= 0 && relY >= 0) {
            const seatWidth = 3;
            const clickedRow = Math.floor(relX / seatWidth) + 1;
            const clickedColIndex = relY;
            
            if (clickedRow >= 1 && clickedRow <= seatmap.rows && 
                clickedColIndex >= 0 && clickedColIndex < seatmap.seatsPerRow.length) {
              const letter = seatmap.seatsPerRow[clickedColIndex];
              if (letter && isSeatAvailable(clickedRow, letter)) {
                const seat = buildSeat(clickedRow, letter);
                setSelectedSeat(seat);
                setSeatCursorRow(clickedRow);
                setSeatCursorCol(clickedColIndex);
                handleConfirm(event.modifiers.shift, seat);
              }
            }
          }
        }
      }
    },
    [countdown, leftPanelWidth, headerHeight, contentHeight, flights, selectedFlightIndex, 
     handleConfirm, seatmap, termHeight, statusBarHeight, isSeatAvailable]
  );

  // Mouse move handler for hover effects
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!seatmap) {
        setHoveredSeat(null);
        return;
      }

      const seatmapHeight = Math.min(14, Math.max(12, Math.floor(contentHeight * 0.45)));
      const seatmapTop = termHeight - statusBarHeight - seatmapHeight;

      // Check if in seatmap area
      if (event.x > leftPanelWidth && event.y >= seatmapTop && event.y < termHeight - statusBarHeight) {
        const seatmapLeftEdge = leftPanelWidth + 5;
        const relX = event.x - seatmapLeftEdge;
        const seatmapContentTop = seatmapTop + 3;
        const relY = event.y - seatmapContentTop;

        if (relX >= 0 && relY >= 0) {
          const seatWidth = 3;
          const hoveredRow = Math.floor(relX / seatWidth) + 1;
          const hoveredColIndex = relY;

          if (hoveredRow >= 1 && hoveredRow <= seatmap.rows &&
              hoveredColIndex >= 0 && hoveredColIndex < seatmap.seatsPerRow.length) {
            const letter = seatmap.seatsPerRow[hoveredColIndex];
            if (letter) {
              const seat = buildSeat(hoveredRow, letter);
              setHoveredSeat(seat);
              return;
            }
          }
        }
      }
      setHoveredSeat(null);
    },
    [seatmap, leftPanelWidth, contentHeight, termHeight, statusBarHeight]
  );

  // Enable mouse tracking
  useMouse({
    enabled: true,
    onClick: handleMouseClick,
    onMove: handleMouseMove,
  });

  // Seatmap height (bottom section) - needs space for 6 seat rows + aisle + header + legend
  const seatmapHeight = seatmap ? Math.min(14, Math.max(12, Math.floor(contentHeight * 0.45))) : 0;
  const detailHeight = contentHeight - seatmapHeight;

  return (
    <Box
      flexDirection="column"
      width={termWidth}
      height={termHeight}
    >
      {/* Cyberpunk Header */}
      <CyberpunkHeader
        title={config?.title || "// FLIGHT_BOOKING_TERMINAL //"}
        width={termWidth}
      />

      {/* Main content area */}
      <Box flexDirection="row" height={contentHeight}>
        {/* Left panel - Flight List */}
        <Box
          flexDirection="column"
          width={leftPanelWidth}
          borderStyle="single"
          borderColor={focusMode === "flights" ? CYBER_COLORS.neonCyan : CYBER_COLORS.dim}
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text color={CYBER_COLORS.neonMagenta} bold>
              {"[ FLIGHTS ]"}
            </Text>
          </Box>
          <FlightList
            flights={flights}
            selectedIndex={selectedFlightIndex}
            focused={focusMode === "flights"}
            maxHeight={contentHeight - 4}
          />
        </Box>

        {/* Right panel - Details */}
        <Box flexDirection="column" width={rightPanelWidth} paddingLeft={1}>
          {/* Route Display */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={CYBER_COLORS.dim}
            paddingX={1}
            height={Math.floor(detailHeight * 0.4)}
          >
            <Box marginBottom={1}>
              <Text color={CYBER_COLORS.neonMagenta} bold>
                {"[ ROUTE ]"}
              </Text>
            </Box>
            {selectedFlight && (
              <RouteDisplay
                origin={selectedFlight.origin}
                destination={selectedFlight.destination}
                width={rightPanelWidth - 4}
              />
            )}
          </Box>

          {/* Flight Info */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={CYBER_COLORS.dim}
            paddingX={1}
            marginTop={0}
            height={Math.floor(detailHeight * 0.6)}
          >
            <Box marginBottom={1}>
              <Text color={CYBER_COLORS.neonMagenta} bold>
                {"[ FLIGHT INFO ]"}
              </Text>
            </Box>
            {selectedFlight && <FlightInfo flight={selectedFlight} />}
          </Box>

          {/* Seatmap (if available) */}
          {seatmap && (
            <Box
              flexDirection="column"
              borderStyle="single"
              borderColor={focusMode === "seatmap" ? CYBER_COLORS.neonCyan : CYBER_COLORS.dim}
              paddingX={1}
              height={seatmapHeight}
            >
              <Box marginBottom={1}>
                <Text color={CYBER_COLORS.neonMagenta} bold>
                  {"[ SEATMAP ]"}
                </Text>
                {selectedSeat && (
                  <Text color={CYBER_COLORS.neonGreen}> Seat: {selectedSeat}</Text>
                )}
              </Box>
              <SeatmapPanel
                seatmap={seatmap}
                selectedSeat={selectedSeat}
                hoveredSeat={hoveredSeat}
                cursorRow={seatCursorRow}
                cursorCol={seatCursorCol}
                focused={focusMode === "seatmap"}
                maxHeight={seatmapHeight - 3}
                maxWidth={rightPanelWidth - 4}
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* Status Bar */}
      <StatusBar
        focusMode={focusMode}
        hasSeatmap={!!seatmap}
        selectedSeat={selectedSeat}
        countdown={countdown}
        spinnerFrame={spinnerFrame}
        spinnerChars={spinnerChars}
        width={termWidth}
      />
    </Box>
  );
}
