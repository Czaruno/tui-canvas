// Calendar Scenario Types

export type InteractionMode = "view-only" | "selection" | "multi-select";
export type CloseOn = "selection" | "escape" | "command" | "never";

// Calendar-specific event type
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO datetime
  endTime: string;
  color?: string;
  allDay?: boolean;
}

// Calendar with named owner for multi-calendar scenarios
export interface NamedCalendar {
  name: string;
  color: string;
  events: CalendarEvent[];
}

// Base calendar config (used by display scenario)
export interface BaseCalendarConfig {
  title?: string;
  events?: CalendarEvent[];
  startHour?: number;
  endHour?: number;
}

// Meeting picker specific config
export interface MeetingPickerConfig extends BaseCalendarConfig {
  calendars: NamedCalendar[];
  slotGranularity: 15 | 30 | 60; // minutes
  minDuration: number; // minutes
  maxDuration: number; // minutes
}

// Meeting picker result
export interface MeetingPickerResult {
  startTime: string; // ISO datetime
  endTime: string;
  duration: number; // minutes
}

// Union type for all calendar configs
export type CalendarScenarioConfig = BaseCalendarConfig | MeetingPickerConfig;

// Type guard for meeting picker config
export function isMeetingPickerConfig(
  config: CalendarScenarioConfig
): config is MeetingPickerConfig {
  return "calendars" in config && Array.isArray(config.calendars);
}
