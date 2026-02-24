import { BillingMethod } from "@api/products/components/billingMethod";
import { UsageTierSchema } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../../features/apiFeatureV1";
import { ApiBalanceResetSchema, ApiBalanceRolloverSchema } from "./apiBalance";

export const API_BALANCE_V1_EXAMPLE = {
	feature_id: "messages",
	granted: 100,
	remaining: 72,
	usage: 28,
	unlimited: false,
	overage_allowed: false,
	max_purchase: null,
	next_reset_at: 1773851121437,
	breakdown: [
		{
			id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
			plan_id: "pro_plan",
			included_grant: 100,
			prepaid_grant: 0,
			remaining: 72,
			usage: 28,
			unlimited: false,
			reset: {
				interval: "month",
				resets_at: 1773851121437,
			},
			price: null,
			expires_at: null,
		},
	],
};

export const ApiBalanceBreakdownPriceSchema = z.object({
	amount: z.number().optional().meta({
		description: "The per-unit price amount.",
	}),
	tiers: z.array(UsageTierSchema).optional().meta({
		description: "Tiered pricing configuration if applicable.",
	}),
	billing_units: z.number().meta({
		description:
			"The number of units per billing increment (eg. $9 / 250 units).",
	}),
	billing_method: z.enum(BillingMethod).meta({
		description: "Whether usage is prepaid or billed pay-per-use.",
	}),
	max_purchase: z.number().nullable().meta({
		description:
			"Maximum quantity that can be purchased, or null for unlimited.",
	}),
});

export const ApiBalanceBreakdownV1Schema = z.object({
	object: z.literal("balance_breakdown").meta({
		internal: true,
	}),

	id: z.string().default("").meta({
		description: "The unique identifier for this balance breakdown.",
	}),
	plan_id: z.string().nullable().meta({
		description:
			"The plan ID this balance originates from, or null for standalone balances.",
	}),

	included_grant: z.number().meta({
		description: "Amount granted from the plan's included usage.",
	}),
	prepaid_grant: z.number().meta({
		description: "Amount granted from prepaid purchases or top-ups.",
	}),
	remaining: z.number().meta({
		description: "Remaining balance available for use.",
	}),
	usage: z.number().meta({
		description: "Amount consumed in the current period.",
	}),
	unlimited: z.boolean().meta({
		description: "Whether this balance has unlimited usage.",
	}),

	reset: ApiBalanceResetSchema.nullable().meta({
		description: "Reset configuration for this balance, or null if no reset.",
	}),

	price: ApiBalanceBreakdownPriceSchema.nullable().meta({
		description:
			"Pricing configuration if this balance has usage-based pricing.",
	}),

	expires_at: z.number().nullable().meta({
		description:
			"Timestamp when this balance expires, or null for no expiration.",
	}),

	overage: z.number().meta({
		internal: true,
	}),
});

export const ApiBalanceV1Schema = z
	.object({
		object: z.literal("balance").meta({
			internal: true,
		}),

		feature_id: z.string().meta({
			description: "The feature ID this balance is for.",
		}),
		feature: ApiFeatureV1Schema.optional().meta({
			description: "The full feature object if expanded.",
		}),

		granted: z.number().meta({
			description: "Total balance granted (included + prepaid).",
		}),

		remaining: z.number().min(0).meta({
			description: "Remaining balance available for use.",
		}),

		usage: z.number().meta({
			description: "Total usage consumed in the current period.",
		}),
		unlimited: z.boolean().meta({
			description: "Whether this feature has unlimited usage.",
		}),

		overage_allowed: z.boolean().meta({
			description:
				"Whether usage beyond the granted balance is allowed (with overage charges).",
		}),
		max_purchase: z.number().nullable().meta({
			description:
				"Maximum quantity that can be purchased as a top-up, or null for unlimited.",
		}),
		next_reset_at: z.number().nullable().meta({
			description:
				"Timestamp when the balance will reset, or null for no reset.",
		}),

		breakdown: z.array(ApiBalanceBreakdownV1Schema).optional().meta({
			description:
				"Detailed breakdown of balance sources when stacking multiple plans or grants.",
		}),
		rollovers: z.array(ApiBalanceRolloverSchema).optional().meta({
			description: "Rollover balances carried over from previous periods.",
		}),
	})
	.meta({
		examples: [API_BALANCE_V1_EXAMPLE],
	});

export type ApiBalanceBreakdownPrice = z.infer<
	typeof ApiBalanceBreakdownPriceSchema
>;
export type ApiBalanceBreakdownV1 = z.infer<typeof ApiBalanceBreakdownV1Schema>;
export type ApiBalanceV1 = z.infer<typeof ApiBalanceV1Schema>;
