import { format } from "date-fns";

export function formatAmount(amount: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount);
}

export function formatPeriodRange(startMs: number, endMs: number): string {
	const formatDate = (ms: number) => format(new Date(ms), "do MMMM yyyy");
	return `${formatDate(startMs)} – ${formatDate(endMs)}`;
}
