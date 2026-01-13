#!/usr/bin/env bun
/**
 * Calendar Canvas - OpenTUI/Solid Implementation
 */

declare const process: any;
declare const Bun: any;

import { render } from "@opentui/solid";
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useIPC } from "../../../packages/core/src/ipc/use-ipc-solid";
import { useMouse, type MouseEvent } from "./use-mouse";

// ============ Types ============

interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  color?: string;
  allDay?: boolean;
}

interface CalendarEventInput {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  color?: string;
  allDay?: boolean;
}

interface NamedCalendarInput {
  name: string;
  color: string;
  events: CalendarEventInput[];
}

interface CalendarConfig {
  title?: string;
  weekStart?: string;
  events?: CalendarEventInput[];
  calendars?: NamedCalendarInput[];
  slotGranularity?: 15 | 30 | 60;
  minDuration?: number;
  maxDuration?: number;
  startHour?: number;
  endHour?: number;
}

interface MeetingPickerResult {
  startTime: string;
  endTime: string;
  duration: number;
}

// ============ Constants ============

const START_HOUR = 6;
const END_HOUR = 22;
const COLORS = ["yellow", "green", "blue", "magenta", "red", "cyan"];
const TEXT_COLORS: Record<string, string> = {
  yellow: "black",
  cyan: "black",
  green: "white",
  blue: "white",
  magenta: "white",
  red: "white",
};

// ============ Utilities ============

function getWeekDays(baseDate: Date): Date[] {
  const days: Date[] = [];
  const dayOfWeek = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));

  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push(day);
  }
  return days;
}

function formatDayName(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()];
}

function formatDayNumber(date: Date): string {
  return date.getDate().toString();
}

function formatMonthYear(date: Date): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 12) return "12";
  return hour < 12 ? `${hour}` : `${hour - 12}`;
}

function getAmPm(hour: number): string {
  return hour < 12 ? "am" : "pm";
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isAllDayEvent(event: CalendarEvent): boolean {
  if (event.allDay) return true;
  const start = event.startTime;
  const end = event.endTime;
  return (
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getTime() - start.getTime() >= 24 * 60 * 60 * 1000
  );
}

function parseEvents(events?: CalendarEventInput[]): CalendarEvent[] {
  if (!events) return [];
  return events.map((event) => ({
    ...event,
    startTime: new Date(event.startTime),
    endTime: new Date(event.endTime),
  }));
}

function getDemoEvents(): CalendarEvent[] {
  const today = new Date();
  const monday = new Date(today);
  const dayOfWeek = today.getDay();
  monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));

  return [
    {
      id: "1",
      title: "Team Standup",
      startTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 9, 0),
      endTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 9, 30),
      color: COLORS[0],
    },
    {
      id: "2",
      title: "Design Review",
      startTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1, 14, 0),
      endTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1, 15, 30),
      color: COLORS[1],
    },
    {
      id: "3",
      title: "Lunch with Sarah",
      startTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2, 12, 0),
      endTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2, 13, 0),
      color: COLORS[2],
    },
    {
      id: "4",
      title: "Product Planning",
      startTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3, 10, 0),
      endTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3, 11, 30),
      color: COLORS[3],
    },
    {
      id: "5",
      title: "1:1 with Manager",
      startTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4, 15, 0),
      endTime: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4, 16, 0),
      color: COLORS[4],
    },
  ];
}

function getInitialDate(config: CalendarConfig): Date {
  if (config.weekStart) {
    const parsed = new Date(config.weekStart);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
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
  const stdin = process.stdin;
  
  if (!stdin.isTTY) return;
  
  // Set up keyboard immediately (don't rely on onMount which may not fire in OpenTUI)
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  const onData = (data: string) => {
    // Skip mouse escape sequences (SGR format: ESC[<...M or ESC[<...m)
    if (data.includes("\x1b[<")) return;
    
    const key = normalizeKey(data);
    if (key) handler(key);
  };

  stdin.on("data", onData);

  onCleanup(() => {
    stdin.off("data", onData);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
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

function isMeetingPickerConfig(config: CalendarConfig): boolean {
  return Array.isArray(config.calendars);
}

// ============ Display Calendar Components ============

interface DayHeaderProps {
  date: Date;
  isToday: boolean;
  width: number;
}

function DayHeader(props: DayHeaderProps) {
  return (
    <box flexDirection="column" width={props.width}>
      <box justifyContent="center" width="100%">
        <text fg={props.isToday ? "#3B82F6" : "#6B7280"}>
          {formatDayName(props.date)}
        </text>
      </box>
      <box justifyContent="center" width="100%">
        <Show when={props.isToday} fallback={<text>{formatDayNumber(props.date)}</text>}>
          <text bg="#3B82F6" fg="#FFFFFF">{` ${formatDayNumber(props.date)} `}</text>
        </Show>
      </box>
    </box>
  );
}

interface DisplayCalendarProps {
  config: CalendarConfig;
  onExit: () => void;
}

function DisplayCalendar(props: DisplayCalendarProps) {
  const dimensions = useStdoutDimensions();
  const [currentDate, setCurrentDate] = createSignal(getInitialDate(props.config));
  const [currentTime, setCurrentTime] = createSignal(new Date());

  const startHour = () => props.config.startHour ?? START_HOUR;
  const endHour = () => props.config.endHour ?? END_HOUR;
  const timeColumnWidth = 6;

  const columnWidth = createMemo(() => {
    const availableWidth = dimensions().width - timeColumnWidth - 4;
    return Math.max(12, Math.floor(availableWidth / 7));
  });

  const events = createMemo(() => {
    const parsed = parseEvents(props.config.events);
    return parsed.length > 0 ? parsed : getDemoEvents();
  });

  const weekDays = createMemo(() => getWeekDays(currentDate()));
  const today = new Date();

  onMount(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    onCleanup(() => clearInterval(timer));
  });

  useKeyboard((key) => {
    if (key === "q" || key === "escape" || key === "ctrl-c") {
      props.onExit();
    } else if (key === "n" || key === "right") {
      setCurrentDate((date) => {
        const next = new Date(date);
        next.setDate(date.getDate() + 7);
        return next;
      });
    } else if (key === "p" || key === "left") {
      setCurrentDate((date) => {
        const prev = new Date(date);
        prev.setDate(date.getDate() - 7);
        return prev;
      });
    } else if (key === "t") {
      setCurrentDate(new Date());
    }
  });

  const allDayEvents = createMemo(() => events().filter(isAllDayEvent));

  const timeSlots = createMemo(() => {
    const slots: Array<{ hour: number; half: number }> = [];
    for (let hour = startHour(); hour < endHour(); hour++) {
      slots.push({ hour, half: 0 });
      slots.push({ hour, half: 1 });
    }
    return slots;
  });

  return (
    <box flexDirection="column" width="100%" height="100%" paddingLeft={1} paddingRight={1}>
      <box marginBottom={1}>
        <text fg="#FFFFFF">{props.config.title || formatMonthYear(weekDays()[0])}</text>
      </box>
      <box marginBottom={1}>
        <text fg="#6B7280">Framework: OpenTUI • Input: ←/→ week, t today, q quit</text>
      </box>

      <box>
        <box width={timeColumnWidth}>
          <text> </text>
        </box>
        <For each={weekDays()}>
          {(day) => (
            <DayHeader date={day} isToday={isSameDay(day, today)} width={columnWidth()} />
          )}
        </For>
      </box>

      <Show when={allDayEvents().length > 0}>
        <AllDayEventsRow
          weekDays={weekDays()}
          events={allDayEvents()}
          columnWidth={columnWidth()}
          timeColumnWidth={timeColumnWidth}
        />
      </Show>

      <box flexGrow={1} flexDirection="row">
        <box flexDirection="column" width={timeColumnWidth}>
          <For each={timeSlots()}>
            {(slot) => (
              <box height={1}>
                <text fg="#6B7280">
                  {slot.half === 0
                    ? `${formatHour(slot.hour)}${getAmPm(slot.hour)}`.padStart(timeColumnWidth - 1)
                    : " "}
                </text>
              </box>
            )}
          </For>
        </box>

        <For each={weekDays()}>
          {(day) => (
            <DayColumn
              date={day}
              events={events()}
              currentTime={currentTime()}
              startHour={startHour()}
              endHour={endHour()}
              columnWidth={columnWidth()}
            />
          )}
        </For>
      </box>

      <box>
        <text fg="#6B7280">←/→ week • t today • q quit</text>
      </box>
    </box>
  );
}

interface DayColumnProps {
  date: Date;
  events: CalendarEvent[];
  currentTime: Date;
  startHour: number;
  endHour: number;
  columnWidth: number;
}

function DayColumn(props: DayColumnProps) {
  const timeSlots = createMemo(() => {
    const slots: Array<{ hour: number; half: number }> = [];
    for (let hour = props.startHour; hour < props.endHour; hour++) {
      slots.push({ hour, half: 0 });
      slots.push({ hour, half: 1 });
    }
    return slots;
  });

  const dayEvents = createMemo(() =>
    props.events.filter((event) => isSameDay(event.startTime, props.date) && !isAllDayEvent(event))
  );

  const currentTimeDecimal = () =>
    props.currentTime.getHours() + props.currentTime.getMinutes() / 60;

  return (
    <box flexDirection="column" width={props.columnWidth}>
      <For each={timeSlots()}>
        {(slot) => {
          const slotTime = slot.hour + slot.half * 0.5;
          const slotEvent = () =>
            dayEvents().find((event) => {
              const eventStart = event.startTime.getHours() + event.startTime.getMinutes() / 60;
              const eventEnd = event.endTime.getHours() + event.endTime.getMinutes() / 60;
              return slotTime >= eventStart && slotTime < eventEnd;
            });

          const isEventStart = () => {
            const event = slotEvent();
            if (!event) return false;
            return (
              event.startTime.getHours() === slot.hour &&
              Math.floor(event.startTime.getMinutes() / 30) === slot.half
            );
          };

          const showNowLine = () =>
            currentTimeDecimal() >= slotTime && currentTimeDecimal() < slotTime + 0.5;

          return (
            <box height={1} width={props.columnWidth}>
              <Show
                when={slotEvent()}
                fallback={
                  <text fg="#4B5563">
                    {showNowLine()
                      ? "━".repeat(props.columnWidth - 1)
                      : slot.half === 0
                      ? "─".repeat(props.columnWidth - 1)
                      : "┄".repeat(props.columnWidth - 1)}
                  </text>
                }
              >
                {(event) => (
                  <text bg={event().color || "blue"} fg={TEXT_COLORS[event().color || "blue"]}>
                    {isEventStart()
                      ? ` ${event().title.slice(0, props.columnWidth - 2)}`.padEnd(props.columnWidth - 1)
                      : " ".repeat(props.columnWidth - 1)}
                  </text>
                )}
              </Show>
            </box>
          );
        }}
      </For>
    </box>
  );
}

interface AllDayEventsRowProps {
  weekDays: Date[];
  events: CalendarEvent[];
  columnWidth: number;
  timeColumnWidth: number;
}

function AllDayEventsRow(props: AllDayEventsRowProps) {
  const eventsByDay = props.weekDays.map((day) =>
    props.events.filter((event) => isSameDay(event.startTime, day))
  );
  const maxRows = Math.max(1, ...eventsByDay.map((dayEvents) => dayEvents.length));

  return (
    <box>
      <box width={props.timeColumnWidth}>
        <text> </text>
      </box>
      <For each={props.weekDays}>
        {(day, dayIndex) => (
          <box flexDirection="column" width={props.columnWidth}>
            <For each={Array.from({ length: maxRows })}>
              {(_, rowIndex) => {
                const event = eventsByDay[dayIndex()][rowIndex()];
                if (!event) {
                  return (
                    <box height={1}>
                      <text fg="#4B5563">{" ".repeat(props.columnWidth - 1)}</text>
                    </box>
                  );
                }

                const textColor = TEXT_COLORS[event.color || "blue"] || "white";
                return (
                  <box height={1}>
                    <text bg={event.color || "blue"} fg={textColor}>
                      {` ${event.title.slice(0, props.columnWidth - 2)}`.padEnd(props.columnWidth - 1)}
                    </text>
                  </box>
                );
              }}
            </For>
          </box>
        )}
      </For>
    </box>
  );
}

// ============ Meeting Picker ============

interface MeetingPickerProps {
  config: CalendarConfig;
  onSelect: (result: MeetingPickerResult) => void;
  onCancel: (reason?: string) => void;
}

function MeetingPicker(props: MeetingPickerProps) {
  const dimensions = useStdoutDimensions();
  const [currentDate, setCurrentDate] = createSignal(getInitialDate(props.config));
  const [cursorDay, setCursorDay] = createSignal(0);
  const [cursorSlot, setCursorSlot] = createSignal(0);
  const [hoveredDay, setHoveredDay] = createSignal<number | null>(null);
  const [hoveredSlot, setHoveredSlot] = createSignal<number | null>(null);
  const [usingKeyboard, setUsingKeyboard] = createSignal(true);
  const [selectedDay, setSelectedDay] = createSignal<number | null>(null);
  const [selectedSlot, setSelectedSlot] = createSignal<number | null>(null);
  const [countdown, setCountdown] = createSignal<number | null>(null); // null = not counting, 3/2/1 = counting, 0 = confirmed
  const [spinnerFrame, setSpinnerFrame] = createSignal(0);
  
  // Simple ASCII spinner (single-width chars only)
  const spinnerChars = ["|", "/", "-", "\\"];

  const slotGranularity = () => props.config.slotGranularity ?? 30;
  const startHour = () => props.config.startHour ?? START_HOUR;
  const endHour = () => props.config.endHour ?? END_HOUR;

  const calendars = createMemo(() =>
    (props.config.calendars ?? []).map((calendar) => ({
      ...calendar,
      events: parseEvents(calendar.events),
    }))
  );

  const weekDays = createMemo(() => getWeekDays(currentDate()));
  const timeColumnWidth = 6;
  const headerHeight = 5; // Title + instructions + legend + day headers
  const footerHeight = 2;

  const columnWidth = createMemo(() => {
    const availableWidth = dimensions().width - timeColumnWidth - 4;
    return Math.max(12, Math.floor(availableWidth / 7));
  });

  const totalSlots = createMemo(() =>
    Math.floor(((endHour() - startHour()) * 60) / slotGranularity())
  );

  // Calculate slot heights to fill vertical space (like original Claude Canvas)
  const slotHeights = createMemo(() => {
    const termHeight = dimensions().height;
    const availableHeight = Math.max(1, termHeight - headerHeight - footerHeight);
    const total = totalSlots();
    const baseSlotHeight = Math.max(1, Math.floor(availableHeight / total));
    const extraRows = availableHeight - baseSlotHeight * total;
    return Array.from({ length: total }, (_, i) =>
      baseSlotHeight + (i < extraRows ? 1 : 0)
    );
  });

  // Calculate cumulative heights for mouse position mapping
  const cumulativeHeights = createMemo(() => {
    const heights = slotHeights();
    return heights.reduce((acc, h, i) => {
      acc.push((acc[i - 1] || 0) + h);
      return acc;
    }, [] as number[]);
  });

  const busyMap = createMemo(() => {
    const map = new Map<string, string[]>();
    for (const calendar of calendars()) {
      for (const event of calendar.events) {
        const eventStart = new Date(event.startTime);
        const eventEnd = new Date(event.endTime);

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
          const day = weekDays()[dayIndex];
          if (!isSameDay(eventStart, day) && !isSameDay(eventEnd, day)) continue;

          for (let slotIndex = 0; slotIndex < totalSlots(); slotIndex++) {
            const slotStart = new Date(day);
            const slotMinutes = slotIndex * slotGranularity();
            slotStart.setHours(
              startHour() + Math.floor(slotMinutes / 60),
              slotMinutes % 60,
              0,
              0
            );
            const slotEnd = new Date(slotStart);
            slotEnd.setMinutes(slotEnd.getMinutes() + slotGranularity());

            if (eventStart < slotEnd && eventEnd > slotStart) {
              const key = `${dayIndex}-${slotIndex}`;
              const colors = map.get(key) || [];
              if (!colors.includes(calendar.color)) {
                colors.push(calendar.color);
              }
              map.set(key, colors);
            }
          }
        }
      }
    }
    return map;
  });

  // Countdown timer effect
  onMount(() => {
    let countdownTimer: ReturnType<typeof setTimeout> | null = null;
    let spinnerTimer: ReturnType<typeof setInterval> | null = null;
    
    const runCountdown = () => {
      const currentCountdown = countdown();
      if (currentCountdown === null) return;
      
      if (currentCountdown === -1) {
        // Final state after checkmark shown - now exit
        const { startTime, endTime } = getSlotInfo(selectedDay()!, selectedSlot()!);
        props.onSelect({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          duration: slotGranularity(),
        });
        return;
      }
      
      if (currentCountdown === 0) {
        // Show checkmark for 1 second, then exit
        countdownTimer = setTimeout(() => {
          setCountdown(-1);
          runCountdown();
        }, 1000);
        return;
      }
      
      // Tick down every second
      countdownTimer = setTimeout(() => {
        setCountdown(currentCountdown - 1);
        runCountdown();
      }, 1000);
    };
    
    // Watch for countdown changes to start the timer
    const checkCountdown = setInterval(() => {
      const c = countdown();
      if (c !== null && c > 0 && !countdownTimer) {
        runCountdown();
      }
    }, 100);
    
    // Spinner animation
    spinnerTimer = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % spinnerChars.length);
    }, 100);
    
    onCleanup(() => {
      if (countdownTimer) clearTimeout(countdownTimer);
      if (spinnerTimer) clearInterval(spinnerTimer);
      clearInterval(checkCountdown);
    });
  });

  const isSlotFree = (dayIndex: number, slotIndex: number) =>
    !busyMap().has(`${dayIndex}-${slotIndex}`);

  const getSlotInfo = (dayIndex: number, slotIndex: number) => {
    const day = weekDays()[dayIndex];
    const slotMinutes = slotIndex * slotGranularity();
    const startTime = new Date(day);
    startTime.setHours(
      startHour() + Math.floor(slotMinutes / 60),
      slotMinutes % 60,
      0,
      0
    );
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + slotGranularity());
    return { day, startTime, endTime };
  };

  // Convert terminal coordinates to slot (using cumulative heights)
  const terminalToSlot = (x: number, y: number): { dayIndex: number; slotIndex: number } | null => {
    const gridLeft = timeColumnWidth + 2; // Account for padding
    const gridTop = headerHeight + 1;

    const relX = x - gridLeft;
    const relY = y - gridTop;

    if (relX < 0 || relY < 0) return null;

    const dayIndex = Math.floor(relX / columnWidth());
    if (dayIndex >= 7) return null;

    // Find slot from cumulative heights
    const heights = slotHeights();
    const total = totalSlots();
    let slotIndex = 0;
    let cumHeight = 0;
    for (let i = 0; i < total; i++) {
      cumHeight += heights[i];
      if (relY < cumHeight) {
        slotIndex = i;
        break;
      }
      if (i === total - 1) {
        slotIndex = i;
      }
    }

    if (slotIndex >= total) return null;

    return { dayIndex, slotIndex };
  };

  // Mouse click handler
  const handleMouseClick = (event: MouseEvent) => {
    const slot = terminalToSlot(event.x, event.y);
    if (slot && isSlotFree(slot.dayIndex, slot.slotIndex)) {
      setSelectedDay(slot.dayIndex);
      setSelectedSlot(slot.slotIndex);
      // Power user: Shift+click skips countdown (check if shift modifier available)
      // For now, always use countdown
      setCountdown(3); // Start 3 second countdown
    }
  };

  // Mouse move handler
  const handleMouseMove = (event: MouseEvent) => {
    const slot = terminalToSlot(event.x, event.y);
    if (slot) {
      setHoveredDay(slot.dayIndex);
      setHoveredSlot(slot.slotIndex);
      setCursorDay(slot.dayIndex);
      setCursorSlot(slot.slotIndex);
      setUsingKeyboard(false);
    } else {
      setHoveredDay(null);
      setHoveredSlot(null);
    }
  };

  // Enable mouse tracking
  useMouse({
    enabled: true,
    onClick: handleMouseClick,
    onMove: handleMouseMove,
  });

  useKeyboard((key) => {
    setUsingKeyboard(true);
    
    // Handle escape/cancel - cancel countdown if active, otherwise exit
    if (key === "q" || key === "escape" || key === "ctrl-c") {
      if (countdown() !== null) {
        // Cancel countdown
        setCountdown(null);
        setSelectedDay(null);
        setSelectedSlot(null);
      } else {
        props.onCancel("User cancelled");
      }
      return;
    }
    
    // If countdown is active, any movement cancels it
    const cancelCountdownIfActive = () => {
      if (countdown() !== null) {
        setCountdown(null);
        setSelectedDay(null);
        setSelectedSlot(null);
      }
    };
    
    if (key === "up") {
      cancelCountdownIfActive();
      setCursorSlot((slot) => Math.max(0, slot - 1));
    } else if (key === "down") {
      cancelCountdownIfActive();
      setCursorSlot((slot) => Math.min(totalSlots() - 1, slot + 1));
    } else if (key === "left") {
      cancelCountdownIfActive();
      setCursorDay((day) => Math.max(0, day - 1));
    } else if (key === "right") {
      cancelCountdownIfActive();
      setCursorDay((day) => Math.min(6, day + 1));
    } else if (key === "n") {
      setCurrentDate((date) => {
        const next = new Date(date);
        next.setDate(date.getDate() + 7);
        return next;
      });
    } else if (key === "p") {
      setCurrentDate((date) => {
        const prev = new Date(date);
        prev.setDate(date.getDate() - 7);
        return prev;
      });
    } else if (key === "t") {
      setCurrentDate(new Date());
    } else if (key === "enter" || key === " ") {
      const dayIndex = cursorDay();
      const slotIndex = cursorSlot();
      if (isSlotFree(dayIndex, slotIndex) && countdown() === null) {
        setSelectedDay(dayIndex);
        setSelectedSlot(slotIndex);
        setCountdown(3); // Start 3 second countdown
      }
    }
  });

  const termWidth = dimensions().width;
  const termHeight = dimensions().height;

  return (
    <box flexDirection="column" width={termWidth} height={termHeight} paddingLeft={1} paddingRight={1}>
      <box marginBottom={1}>
        <text fg="#FFFFFF">
          {props.config.title || `${formatMonthYear(weekDays()[0])} - Select a meeting time`}
        </text>
      </box>
      <box marginBottom={1}>
        <text fg="#6B7280">Input: arrows move, Enter select, n/p week, t today, q cancel</text>
      </box>

      <box marginBottom={1} flexDirection="row">
        <For each={calendars()}>
          {(calendar) => (
            <box marginRight={2}>
              <text bg={calendar.color} fg={TEXT_COLORS[calendar.color] || "white"}>{` ${calendar.name} `}</text>
            </box>
          )}
        </For>
      </box>

      {/* Day headers row */}
      <box flexDirection="row">
        <box width={timeColumnWidth}>
          <text> </text>
        </box>
        <For each={weekDays()}>
          {(day) => (
            <box width={columnWidth()} flexDirection="column">
              <box justifyContent="center" width={columnWidth()}>
                <text fg={isSameDay(day, new Date()) ? "#3B82F6" : "#6B7280"}>
                  {formatDayName(day)}
                </text>
              </box>
              <box justifyContent="center" width={columnWidth()}>
                <Show when={isSameDay(day, new Date())} fallback={<text>{formatDayNumber(day)}</text>}>
                  <text bg="#3B82F6" fg="#FFFFFF">{` ${formatDayNumber(day)} `}</text>
                </Show>
              </box>
            </box>
          )}
        </For>
      </box>

      {/* Calendar grid */}
      <box flexGrow={1} flexDirection="row">
        <box flexDirection="column" width={timeColumnWidth}>
          <For each={Array.from({ length: totalSlots() })}>
            {(_, slotIndex) => {
              const slotMinutes = slotIndex() * slotGranularity();
              const hour = startHour() + Math.floor(slotMinutes / 60);
              const minute = slotMinutes % 60;
              const showLabel = minute === 0;
              const height = slotHeights()[slotIndex()];
              
              return (
                <box height={height} flexDirection="column">
                  <For each={Array.from({ length: height })}>
                    {(_, lineIndex) => (
                      <text fg="#6B7280">
                        {lineIndex() === 0 && showLabel
                          ? `${formatHour(hour)}${getAmPm(hour)}`.padStart(timeColumnWidth - 1)
                          : " ".repeat(timeColumnWidth - 1)}
                      </text>
                    )}
                  </For>
                </box>
              );
            }}
          </For>
        </box>

        <For each={weekDays()}>
          {(day, dayIndex) => {
            const colW = columnWidth();
            return (
              <box flexDirection="column" width={colW}>
                <For each={Array.from({ length: totalSlots() })}>
                  {(_, slotIndex) => {
                    const key = `${dayIndex()}-${slotIndex()}`;
                    const busyColors = busyMap().get(key) || [];
                    const isCursor = dayIndex() === cursorDay() && slotIndex() === cursorSlot();
                    const isHovered = !usingKeyboard() && dayIndex() === hoveredDay() && slotIndex() === hoveredSlot();
                    const isSelected = dayIndex() === selectedDay() && slotIndex() === selectedSlot();
                    const isFree = busyColors.length === 0;
                    const slotMinutes = slotIndex() * slotGranularity();
                    const minute = slotMinutes % 60;
                    const height = slotHeights()[slotIndex()];
                    const currentCountdown = countdown();

                    let bg: string | undefined;
                    let fg = "#4B5563";
                    let firstLineText = minute === 0 ? "─".repeat(colW - 1) : "┄".repeat(colW - 1);
                    let secondLineText = " ".repeat(colW - 1);

                    if (busyColors.length > 0) {
                      bg = busyColors[0];
                      fg = TEXT_COLORS[bg] || "white";
                      firstLineText = " busy".padEnd(colW - 1);
                    }

                    // Selected slot with countdown takes highest priority
                    if (isSelected) {
                      bg = "green";
                      fg = "black";
                      if (currentCountdown !== null && currentCountdown > 0) {
                        // Counting down
                        const spin = spinnerChars[spinnerFrame()];
                        firstLineText = (` ${spin} ${currentCountdown}...`).padEnd(colW - 1);
                        if (height > 1) {
                          secondLineText = " esc cancel".padEnd(colW - 1);
                        }
                      } else if (currentCountdown === 0 || currentCountdown === -1) {
                        // Confirmed - show checkmark
                        firstLineText = " * confirmed".padEnd(colW - 1);
                      } else {
                        firstLineText = " ok".padEnd(colW - 1);
                      }
                    } else if (isCursor && isFree && usingKeyboard() && currentCountdown === null) {
                      // Keyboard cursor on free slot (only when not counting down)
                      bg = "blue";
                      fg = "white";
                      firstLineText = " return".padEnd(colW - 1);
                    } else if (isCursor && !isFree && usingKeyboard()) {
                      // Keyboard cursor on busy slot
                      bg = busyColors[0] || "red";
                      fg = TEXT_COLORS[bg] || "white";
                      firstLineText = " busy".padEnd(colW - 1);
                    } else if (isHovered && isFree && currentCountdown === null) {
                      // Mouse hover on free slot (only when not counting down)
                      bg = "white";
                      fg = "black";
                      firstLineText = " click".padEnd(colW - 1);
                    } else if (isCursor && !usingKeyboard() && isFree && currentCountdown === null) {
                      // Mouse mode cursor on free slot
                      bg = "white";
                      fg = "black";
                      firstLineText = " click".padEnd(colW - 1);
                    }

                    // Render multiple lines if slot height > 1
                    return (
                      <box height={height} width={colW} flexDirection="column">
                        <For each={Array.from({ length: height })}>
                          {(_, lineIndex) => (
                            <text bg={bg} fg={fg}>
                              {lineIndex() === 0 ? firstLineText : lineIndex() === 1 ? secondLineText : " ".repeat(colW - 1)}
                            </text>
                          )}
                        </For>
                      </box>
                    );
                  }}
                </For>
              </box>
            );
          }}
        </For>
      </box>

      <Show when={countdown() !== null && selectedSlot() !== null} fallback={
        <>
          <box>
            <text fg="#6B7280">{"↑↓←→ move • Enter select • n/p week • t today • q cancel"}</text>
          </box>
          <Show when={totalSlots() > 0}>
            <box>
              {(() => {
                const { startTime, endTime } = getSlotInfo(cursorDay(), cursorSlot());
                return (
                  <text fg={isSlotFree(cursorDay(), cursorSlot()) ? "#22D3EE" : "#6B7280"}>
                    {`${startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${endTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ${startTime.toLocaleDateString([], { weekday: "short" })}`}
                    {isSlotFree(cursorDay(), cursorSlot()) ? "" : " (busy)"}
                  </text>
                );
              })()}
            </box>
          </Show>
        </>
      }>
        <box>
          <text fg="#6B7280">Esc to cancel</text>
        </box>
      </Show>
    </box>
  );
}

// ============ Main App ============

interface CalendarAppProps {
  id: string;
  socketPath?: string;
  scenario: string;
  config: CalendarConfig;
}

function CalendarApp(props: CalendarAppProps) {
  const [config, setConfig] = createSignal<CalendarConfig>(props.config || {});
  
  const exitCanvas = (code = 0) => {
    process.exit(code);
  };
  
  // IPC for communicating with controller (canvas connects as client to controller server)
  const ipc = useIPC({
    socketPath: props.socketPath,
    scenario: props.scenario || "display",
    onClose: () => exitCanvas(0),
    onUpdate: (newConfig: unknown) => {
      setConfig(newConfig as CalendarConfig);
    },
    // Calendar doesn't have text selection, so no onGetSelection callback
  });

  const [lastSelection, setLastSelection] = createSignal<MeetingPickerResult | null>(null);

  const handleSelect = (data: MeetingPickerResult) => {
    setLastSelection(data);
    ipc.sendSelected(data);
    exitCanvas(0);
  };

  const handleCancel = (reason?: string) => {
    ipc.sendCancelled(reason);
    exitCanvas(0);
  };

  return isMeetingPickerConfig(config()) && props.scenario === "meeting-picker" ? (
    <MeetingPicker config={config()} onSelect={handleSelect} onCancel={handleCancel} />
  ) : (
    <DisplayCalendar config={config()} onExit={() => exitCanvas(0)} />
  );
}

export function runCalendar(props: CalendarAppProps) {
  // Call CalendarApp directly (not via JSX) to ensure hooks run synchronously
  // This is necessary because OpenTUI's render might not trigger Solid.js lifecycle properly
  render(() => CalendarApp(props), { useThread: false });
}
