import { format } from "date-fns";

export function formatAmount(cents: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(cents / 100);
}

export function formatDate(timestamp: number): string {
	return format(new Date(timestamp * 1000), "d MMM yyyy");
}
