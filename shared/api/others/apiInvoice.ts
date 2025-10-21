import { z } from "zod/v4";

export const ApiInvoiceItemSchema = z.object({
	description: z.string().meta({
		description: "Description of the invoice line item",
		example: "Pro Plan - Monthly Subscription",
	}),
	period_start: z.number().meta({
		description: "Timestamp when the billing period starts",
		example: 1759247877000,
	}),
	period_end: z.number().meta({
		description: "Timestamp when the billing period ends",
		example: 1761839877000,
	}),

	feature_id: z.string().optional().meta({
		description: "The ID of the feature associated with this line item",
		example: "feature_123",
	}),
	feature_name: z.string().optional().meta({
		description: "The name of the feature associated with this line item",
		example: "API Calls",
	}),
});

export const ApiInvoiceSchema = z.object({
	product_ids: z.array(z.string()).meta({
		description: "Array of product IDs included in this invoice",
		example: ["pro_plan", "addon_feature"],
	}),
	stripe_id: z.string().meta({
		description: "The Stripe invoice ID",
		example: "in_1A2B3C4D5E6F7G8H",
	}),
	status: z.string().meta({
		description: "The status of the invoice",
		example: "paid",
	}),
	total: z.number().meta({
		description: "The total amount of the invoice",
		example: 2999,
	}),
	currency: z.string().meta({
		description: "The currency code for the invoice",
		example: "usd",
	}),
	created_at: z.number().meta({
		description: "Timestamp when the invoice was created",
		example: 1759247877000,
	}),
	hosted_invoice_url: z.string().nullish().meta({
		description: "URL to the Stripe-hosted invoice page",
		example: "https://invoice.stripe.com/i/acct_123/test_456",
	}),
	// period_start: z.number().nullish(),
	// period_end: z.number().nullish(),
});

export type ApiInvoice = z.infer<typeof ApiInvoiceSchema>;
