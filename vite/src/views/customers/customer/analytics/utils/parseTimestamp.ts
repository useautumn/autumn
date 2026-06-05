import { format, parseISO } from "date-fns";

export function parseUTCTimestamp(timestamp: string): Date {
	if (
		!timestamp.includes("Z") &&
		!timestamp.includes("+") &&
		!timestamp.includes("-", 10)
	) {
		return new Date(timestamp + (timestamp.includes("T") ? "Z" : " UTC"));
	}
	return parseISO(timestamp);
}

// Day/month buckets are already in the viewer's local zone (the pipe uses
// toStartOfDay(hour, tz)), so parse a bare string as local, not UTC.
export function parseLocalTimestamp(timestamp: string): Date {
	if (
		!timestamp.includes("Z") &&
		!timestamp.includes("+") &&
		!timestamp.includes("-", 10)
	) {
		return new Date(timestamp.replace(" ", "T"));
	}
	return parseISO(timestamp);
}

export function formatDateShort(date: Date): string {
	return format(date, "d MMM");
}

export function formatHourMinute(date: Date): string {
	return format(date, "HH:mm");
}

export function formatFullTimestamp(date: Date): string {
	return format(date, "d MMM 'at' HH:mm:ss");
}

// Hour buckets are UTC, day/month buckets are local — parse each in its own zone.
export function formatPeriodLabel({
	period,
	interval,
}: {
	period: string;
	interval: string | null;
}): string {
	const date =
		interval === "24h"
			? parseUTCTimestamp(period)
			: parseLocalTimestamp(period);
	if (!Number.isFinite(date.getTime())) return period;
	return interval === "24h" ? formatHourMinute(date) : formatDateShort(date);
}

export function formatCompactNumber(value: number): string {
	const absValue = Math.abs(value);
	if (absValue >= 1_000_000_000)
		return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
	if (absValue >= 1_000_000)
		return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (absValue >= 1_000)
		return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
	return value.toString();
}
