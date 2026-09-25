import type { InvoicePaymentMethod } from "@autumn/shared";

export const INVOICE_PAYMENT_METHOD_OPTIONS = [
	{ value: "card", label: "Card" },
	{ value: "customer_balance", label: "Bank transfer" },
	{ value: "us_bank_account", label: "ACH direct debit" },
	{ value: "sepa_debit", label: "SEPA direct debit" },
	{ value: "bacs_debit", label: "Bacs direct debit" },
	{ value: "acss_debit", label: "Pre-authorized debit (Canada)" },
	{ value: "link", label: "Link" },
] as const satisfies readonly { value: InvoicePaymentMethod; label: string }[];
