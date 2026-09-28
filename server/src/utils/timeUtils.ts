import { Duration, EntInterval, Entitlement } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { add } from "date-fns";
import { formatUnixToDate } from "./genUtils.js";

// Time conversion constants
const TIME_MS = {
	SECOND: 1000,
	MINUTE: 1000 * 60,
	HOUR: 1000 * 60 * 60,
	DAY: 1000 * 60 * 60 * 24,
	WEEK: 1000 * 60 * 60 * 24 * 7,
} as const;

// Time conversion utility functions
export const toMilliseconds = {
	seconds: (n: number) => n * TIME_MS.SECOND,
	minutes: (n: number) => n * TIME_MS.MINUTE,
	hours: (n: number) => n * TIME_MS.HOUR,
	days: (n: number) => n * TIME_MS.DAY,
	weeks: (n: number) => n * TIME_MS.WEEK,
} as const;
