import { Box, Text } from "ink";
import type { ApiInvoice } from "../../types.js";
import { formatDate } from "../../types.js";

export interface InvoicesSectionProps {
	invoices: ApiInvoice[];
}

/**
 * Renders customer invoices
 */
export function InvoicesSection({ invoices }: InvoicesSectionProps) {
	if (invoices.length === 0) {
		return (
			<Box flexDirection="column">
				<Text bold color="gray">
					Invoices
				</Text>
				<Text dimColor>No invoices</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold color="gray">
				Invoices ({invoices.length})
			</Text>
			<Box flexDirection="column" paddingLeft={1}>
				{invoices.slice(0, 5).map((invoice) => (
					<InvoiceRow key={invoice.stripe_id} invoice={invoice} />
				))}
				{invoices.length > 5 && (
					<Text dimColor>...and {invoices.length - 5} more</Text>
				)}
			</Box>
		</Box>
	);
}

function InvoiceRow({ invoice }: { invoice: ApiInvoice }) {
	const statusColor = getInvoiceStatusColor(invoice.status);
	const amount = formatCurrency(invoice.total, invoice.currency);

	return (
		<Box>
			<Text color={statusColor}>{getStatusIcon(invoice.status)} </Text>
			<Text>{amount}</Text>
			<Text dimColor> - {formatDate(invoice.created_at)}</Text>
			<Text color={statusColor}> ({invoice.status})</Text>
		</Box>
	);
}

function formatCurrency(dollars: number, currency: string): string {
	const formatter = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	});
	return formatter.format(dollars);
}

function getInvoiceStatusColor(status: string): string {
	switch (status) {
		case "paid":
			return "green";
		case "open":
		case "draft":
			return "yellow";
		case "void":
		case "uncollectible":
			return "gray";
		default:
			return "white";
	}
}

function getStatusIcon(status: string): string {
	switch (status) {
		case "paid":
			return "✓";
		case "open":
		case "draft":
			return "○";
		case "void":
		case "uncollectible":
			return "✗";
		default:
			return "○";
	}
}
