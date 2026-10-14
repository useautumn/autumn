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

const OTHER_PAYMENT_METHOD_LABELS: Record<string, string> = {
	affirm: "Affirm",
	afterpay_clearpay: "Afterpay",
	alipay: "Alipay",
	apple_pay: "Apple Pay",
	bancontact: "Bancontact",
	blik: "BLIK",
	cashapp: "Cash App Pay",
	eps: "EPS",
	giropay: "giropay",
	google_pay: "Google Pay",
	ideal: "iDEAL",
	klarna: "Klarna",
	p24: "Przelewy24",
	paypal: "PayPal",
	wechat_pay: "WeChat Pay",
};

export const paymentMethodLabel = (type: string) =>
	INVOICE_PAYMENT_METHOD_OPTIONS.find((option) => option.value === type)
		?.label ??
	OTHER_PAYMENT_METHOD_LABELS[type] ??
	type.replace(/_/g, " ");
