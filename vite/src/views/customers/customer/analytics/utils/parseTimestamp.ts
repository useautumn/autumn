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

export function formatBinStartLabel({
	binStart,
	interval,
}: {
	binStart: number;
	interval: string | null;
}): string {
	const date = new Date(binStart);
	if (interval === "24h") return formatHourMinute(date);
	return formatDateShort(
		new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

export function formatCompactNumber(value: number): string {
	const absValue = Math.abs(value);
	if (absValue >= 1_000_000_000)
		return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
	if (absValue >= 1_000_000)
		return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (absValue >= 1_000)
		return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
	if (Number.isInteger(value)) return value.toString();
	if (absValue < 0.01) return value > 0 ? "<0.01" : ">-0.01";
	return value.toFixed(absValue >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}
