import { ApiListInvoiceV1Schema } from "../../others/apiInvoice/apiListInvoiceV1.js";

export const INVOICE_FINALIZED_EXAMPLE = {
	object: "invoice.finalized",
	id: "inv_2b3c4d5e6f7g8h",
	customer_id: "acme_corp",
	entity_id: null,
	plan_ids: ["enterprise"],
	stripe_id: "in_1A2B3C4D5E6F7G8H",
	processor_type: "stripe",
	status: "open",
	total: 4505,
	amount_paid: null,
	refunded_amount: 0,
	currency: "usd",
	created_at: 1788220800000,
	hosted_invoice_url:
		"https://api.useautumn.com/invoices/hosted_invoice_url/inv_2b3c4d5e6f7g8h",
	items: [
		{
			description: "Enterprise plan",
			plan_id: "enterprise",
			feature_id: null,
			feature_name: null,
			quantity: null,
			amount: 2400,
			period_start: 1785542400000,
			period_end: 1788220800000,
			entities: [],
		},
		{
			description: "AI credits",
			plan_id: "enterprise",
			feature_id: "ai_credits",
			feature_name: "AI Credits",
			quantity: 842000,
			amount: 1684,
			period_start: 1785542400000,
			period_end: 1788220800000,
			entities: [
				{ entity_id: "acme-docs-prod", quantity: 842000, amount: 1684 },
			],
		},
	],
};

/** Body is the `invoices.list` invoice object with `items` populated. */
export const InvoiceFinalizedSchema = ApiListInvoiceV1Schema.meta({
	examples: [INVOICE_FINALIZED_EXAMPLE],
});
