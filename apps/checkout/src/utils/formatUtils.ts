import { format } from "date-fns";

export function formatAmount(amount: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount);
}

export function formatDate(timestamp: number): string {
	return format(new Date(timestamp * 1000), "d MMM yyyy");
}
