#!/usr/bin/env bun
/**
 * Calendar Canvas - OpenTUI/Solid Implementation
 * 
 * This is the first-class OpenTUI implementation of the Calendar Canvas.
 * Uses @opentui/solid for declarative Solid.js-based rendering.
 */

import { render } from "@opentui/solid";
import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { parseArgs } from "util";

// ============ Types ============

interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  color?: string;
  allDay?: boolean;
}

interface CalendarConfig {
  title?: string;
  events?: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    color?: string;
    allDay?: boolean;
  }>;
}

// ============ Constants ============

const START_HOUR = 6;
const END_HOUR = 22;
const COLORS = ["yellow", "green", "blue", "magenta", "red", "cyan"];

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
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
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

// ============ Components ============

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
        <Show 
          when={props.isToday}
          fallback={<text bold>{formatDayNumber(props.date)}</text>}
        >
          <text bg="#3B82F6" fg="#FFFFFF" bold>
            {` ${formatDayNumber(props.date)} `}
          </text>
        </Show>
      </box>
    </box>
  );
}

interface TimeSlotProps {
  hour: number;
  half: number;
  events: CalendarEvent[];
  date: Date;
  width: number;
}

function TimeSlot(props: TimeSlotProps) {
  const slotTime = () => props.hour + (props.half * 30) / 60;
  
  const slotEvent = () => props.events.find(e => {
    if (!isSameDay(e.startTime, props.date)) return false;
    const eventStart = e.startTime.getHours() + e.startTime.getMinutes() / 60;
    const eventEnd = e.endTime.getHours() + e.endTime.getMinutes() / 60;
    return slotTime() >= eventStart && slotTime() < eventEnd;
  });
  
  const isEventStart = () => {
    const event = slotEvent();
    if (!event) return false;
    return event.startTime.getHours() === props.hour &&
           Math.floor(event.startTime.getMinutes() / 30) === props.half;
  };

  return (
    <box height={1} width={props.width}>
      <Show
        when={slotEvent()}
        fallback={
          <text fg="#4B5563" dimColor>
            {props.half === 0 ? "─".repeat(props.width - 1) : "┄".repeat(props.width - 1)}
          </text>
        }
      >
        {(event) => (
          <text bg={event().color || "blue"} fg="#FFFFFF" bold>
            {isEventStart() 
              ? ` ${event().title.slice(0, props.width - 2)}`.padEnd(props.width - 1)
              : " ".repeat(props.width - 1)
            }
          </text>
        )}
      </Show>
    </box>
  );
}

interface CalendarProps {
  config?: CalendarConfig;
}

function Calendar(props: CalendarProps) {
  const [currentDate, setCurrentDate] = createSignal(new Date());
  
  const events = (): CalendarEvent[] => {
    if (props.config?.events) {
      return props.config.events.map(e => ({
        ...e,
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime),
      }));
    }
    return getDemoEvents();
  };
  
  const weekDays = () => getWeekDays(currentDate());
  const today = new Date();
  
  // Keyboard handling would go here with onKeyPress
  // For now, this is a display-only version
  
  const timeColumnWidth = 6;
  const columnWidth = 14;
  
  // Generate time slots
  const timeSlots = () => {
    const slots: Array<{ hour: number; half: number }> = [];
    for (let hour = START_HOUR; hour < END_HOUR; hour++) {
      slots.push({ hour, half: 0 });
      slots.push({ hour, half: 1 });
    }
    return slots;
  };

  return (
    <box flexDirection="column" width="100%" height="100%" paddingLeft={1} paddingRight={1}>
      {/* Title bar */}
      <box marginBottom={1}>
        <text bold fg="#FFFFFF">{formatMonthYear(weekDays()[0])}</text>
      </box>

      {/* Day headers row */}
      <box>
        {/* Empty space for time column */}
        <box width={timeColumnWidth}>
          <text> </text>
        </box>
        {/* Day headers */}
        <For each={weekDays()}>
          {(day) => (
            <DayHeader 
              date={day} 
              isToday={isSameDay(day, today)} 
              width={columnWidth} 
            />
          )}
        </For>
      </box>

      {/* Calendar time grid */}
      <box flexGrow={1} flexDirection="row">
        {/* Time column */}
        <box flexDirection="column" width={timeColumnWidth}>
          <For each={timeSlots()}>
            {(slot) => (
              <box height={1}>
                <text fg="#6B7280">
                  {slot.half === 0 
                    ? `${formatHour(slot.hour)}${getAmPm(slot.hour)}`.padStart(timeColumnWidth - 1)
                    : " "
                  }
                </text>
              </box>
            )}
          </For>
        </box>

        {/* Day columns */}
        <For each={weekDays()}>
          {(day) => (
            <box flexDirection="column" width={columnWidth}>
              <For each={timeSlots()}>
                {(slot) => (
                  <TimeSlot
                    hour={slot.hour}
                    half={slot.half}
                    events={events()}
                    date={day}
                    width={columnWidth}
                  />
                )}
              </For>
            </box>
          )}
        </For>
      </box>

      {/* Help bar */}
      <box>
        <text fg="#6B7280">OpenTUI Calendar | q to quit</text>
      </box>
    </box>
  );
}

// ============ Main Entry Point ============

// Parse command line arguments
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    id: { type: "string", default: `calendar-${Date.now()}` },
    socket: { type: "string" },
    scenario: { type: "string", default: "display" },
    "config-file": { type: "string" },
    config: { type: "string" },
  },
  allowPositionals: true,
});

// Load config from file or inline
let config: CalendarConfig = {};
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

// Render the calendar
render(() => <Calendar config={config} />);
