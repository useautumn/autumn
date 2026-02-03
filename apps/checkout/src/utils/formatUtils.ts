import { format } from "date-fns";

export function formatAmount(amount: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount);
}

export function formatDate(timestamp: number): string {
	return format(new Date(timestamp * 1000), "do MMMM yyyy");
}

/** Formats a millisecond timestamp to a readable date (e.g., "3rd February") */
export function formatPeriodDate(timestampMs: number): string {
	return format(new Date(timestampMs), "do MMMM");
}

/** Formats a period range from millisecond timestamps (e.g., "Feb 18 – Mar 4") */
export function formatPeriodRange(startMs: number, endMs: number): string {
	return `${formatPeriodDate(startMs)} – ${formatPeriodDate(endMs)}`;
}
