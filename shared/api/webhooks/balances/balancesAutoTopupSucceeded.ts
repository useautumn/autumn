import { z } from "zod/v4";

export const BalancesAutoTopupSucceededInvoiceSchema = z.object({
	stripe_id: z.string().meta({
		description: "The Stripe invoice ID.",
	}),
	status: z.string().nullish().meta({
		description: "The status of the invoice.",
	}),
	total: z.number().meta({
		description: "The total amount of the invoice.",
	}),
	currency: z.string().meta({
		description: "The currency code for the invoice.",
	}),
	hosted_invoice_url: z.string().nullish().meta({
		description: "URL to the hosted invoice page, if available.",
	}),
});

export const BALANCES_AUTO_TOPUP_SUCCEEDED_EXAMPLE = {
	customer_id: "cus_123",
	feature_id: "messages",
	customer_product_id: "cp_123",
	quantity_granted: 100,
	threshold: 20,
	balance_after: 115,
	invoice_mode: false,
	invoice: {
		stripe_id: "in_1A2B3C4D5E6F7G8H",
		status: "paid",
		total: 1000,
		currency: "usd",
		hosted_invoice_url: "https://invoice.stripe.com/i/acct_123/test_456",
	},
};

export const BalancesAutoTopupSucceededSchema = z
	.object({
		customer_id: z.string().meta({
			description: "The ID of the customer whose balance was topped up.",
		}),
		feature_id: z.string().meta({
			description: "The feature ID that was automatically topped up.",
		}),
		customer_product_id: z.string().meta({
			description:
				"The Autumn customer product ID whose prepaid quantity was updated.",
		}),
		quantity_granted: z.number().meta({
			description: "The normalized amount of balance granted by the top-up.",
		}),
		threshold: z.number().meta({
			description:
				"The configured balance threshold that triggered the top-up.",
		}),
		balance_after: z.number().meta({
			description:
				"The customer's remaining balance for the feature after the top-up.",
		}),
		invoice_mode: z.boolean().meta({
			description:
				"Whether the auto top-up created a send_invoice invoice instead of auto-charging.",
		}),
		invoice: BalancesAutoTopupSucceededInvoiceSchema.meta({
			description: "The invoice created for the auto top-up.",
		}),
	})
	.meta({
		examples: [BALANCES_AUTO_TOPUP_SUCCEEDED_EXAMPLE],
	});

export type BalancesAutoTopupSucceeded = z.infer<
	typeof BalancesAutoTopupSucceededSchema
>;
export type BalancesAutoTopupSucceededInvoice = z.infer<
	typeof BalancesAutoTopupSucceededInvoiceSchema
>;
