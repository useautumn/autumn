import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { z } from "zod/v4";
import { DisplaySchema } from "../display";

export const BasePriceSchema = z.object({
	amount: z.number().meta({
		description: "Base price amount for the plan.",
	}),
	interval: z.enum(BillingInterval).meta({
		description: "Billing interval (e.g. 'month', 'year').",
	}),
	interval_count: z.number().optional().meta({
		description: "Number of intervals per billing cycle. Defaults to 1.",
	}),
	display: DisplaySchema.optional().meta({
		description: "Display text for showing this price in pricing pages.",
	}),
});

export const BasePriceParamsSchema = BasePriceSchema.omit({
	display: true,
})
	.extend({
		interval_count: z.number().optional().meta({
			description: "Number of intervals per billing cycle. Defaults to 1.",
		}),

		entitlement_id: z.string().optional().meta({
			internal: true,
		}),
		price_id: z.string().optional().meta({
			internal: true,
		}),
		stripe_price_id: z.string().optional().meta({
			description:
				"Stripe price id this base price is billed under. Set by sync flows to capture the actual Stripe price when it differs from the catalog default.",
			internal: true,
		}),
	})
	.meta({
		title: "BasePrice",
		description: "Base price configuration for a plan.",
	});

export type BasePrice = z.infer<typeof BasePriceSchema>;
export type BasePriceParams = z.infer<typeof BasePriceParamsSchema>;
