import { z } from "zod/v4";

export const ApiInvoiceV0Schema = z.object({
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
});

export type ApiInvoiceV0 = z.infer<typeof ApiInvoiceV0Schema>;
