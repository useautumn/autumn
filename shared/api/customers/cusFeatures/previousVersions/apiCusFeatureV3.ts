import { ApiFeatureType } from "@api/features/prevVersions/apiFeatureV0.js";
import { EntInterval } from "@models/productModels/intervals/entitlementInterval.js";
import { z } from "zod/v4";

// Descriptions
const breakdownDescriptions = {
	interval: "The reset interval for this feature breakdown",
	interval_count: "The number of intervals between usage resets",
	balance:
		"The remaining available balance for this interval. Only present for metered features",
	usage: "The total amount of usage consumed in the current cycle",
	included_usage:
		"The amount of usage included in the customer's plan for this interval",
	next_reset_at:
		"Unix timestamp (in milliseconds) when the usage counter will reset for the next billing period",
	usage_limit:
		"The maximum usage allowed for this feature. null if unlimited or no limit is set",
	overage_allowed:
		"Whether the customer can continue using the feature beyond the usage limit. If false, access is blocked when limit is reached",
};

const coreFeatureDescriptions = {
	interval:
		"The billing interval (e.g., 'month', 'year') or 'multiple' if the feature has different intervals across subscriptions",
	interval_count: "The number of intervals between usage resets",
	unlimited:
		"Whether the feature has unlimited usage with no restrictions or limits",
	balance:
		"The remaining available balance across all subscriptions for this feature (or all time for allocated features)",
	usage:
		"The total cumulative usage consumed in the current cycle across all subscriptions (or all time for allocated features)",
	included_usage:
		"The total amount of usage included in the customer's plan(s) for this feature",
	next_reset_at:
		"Unix timestamp (in milliseconds) when the usage counter will reset for the next cycle",
	overage_allowed:
		"Whether the customer can continue using the feature beyond the included usage. If false, access is blocked when limit is reached",
	breakdown:
		"Detailed breakdown by interval for features with multiple reset intervals across different subscriptions",

	usage_limit:
		"If this feature has a price, the usage limit indicates the maximum amount of usage the customer can use of this feature.",
};

export const ApiCusFeatureV3RolloverSchema = z.object({
	balance: z.number().meta({
		internal: true,
	}),
	expires_at: z.number().meta({
		internal: true,
	}),
});

// Version 3 of cus feature response
export const ApiCusFeatureV3BreakdownSchema = z.object({
	interval: z.enum(EntInterval).nullable().meta({
		description: breakdownDescriptions.interval,
	}),
	interval_count: z.number().nullish().meta({
		description: breakdownDescriptions.interval_count,
	}),
	balance: z.number().nullish().meta({
		description: breakdownDescriptions.balance,
	}),
	usage: z.number().nullish().meta({
		description: breakdownDescriptions.usage,
	}),
	included_usage: z.number().nullish().meta({
		description: breakdownDescriptions.included_usage,
	}),
	next_reset_at: z.number().nullish().meta({
		description: breakdownDescriptions.next_reset_at,
	}),
	usage_limit: z.number().nullish().meta({
		description: breakdownDescriptions.usage_limit,
	}),

	overage_allowed: z.boolean().nullish().meta({
		description: breakdownDescriptions.overage_allowed,
	}),
});

export const CoreCusFeatureSchema = z.object({
	interval: z.enum(EntInterval).or(z.literal("multiple")).nullish().meta({
		description: coreFeatureDescriptions.interval,
	}),
	interval_count: z.number().nullish().meta({
		description: coreFeatureDescriptions.interval_count,
	}),
	unlimited: z.boolean().nullish().meta({
		description: coreFeatureDescriptions.unlimited,
	}),
	balance: z.number().nullish().meta({
		description: coreFeatureDescriptions.balance,
	}),
	usage: z.number().nullish().meta({
		description: coreFeatureDescriptions.usage,
	}),
	included_usage: z.number().nullish().meta({
		description: coreFeatureDescriptions.included_usage,
	}),
	next_reset_at: z.number().nullish().meta({
		description: coreFeatureDescriptions.next_reset_at,
	}),
	overage_allowed: z.boolean().nullish().meta({
		description: coreFeatureDescriptions.overage_allowed,
	}),

	breakdown: z.array(ApiCusFeatureV3BreakdownSchema).nullish().meta({
		description:
			"Detailed breakdown by interval for features with multiple intervals",
	}),
	credit_schema: z
		.array(
			z.object({
				feature_id: z.string(),
				credit_amount: z.number(),
			}),
		)
		.nullish()
		.meta({ internal: true }),

	usage_limit: z.number().nullish().meta({
		description: coreFeatureDescriptions.usage_limit,
	}),
	rollovers: z.array(ApiCusFeatureV3RolloverSchema).nullish().meta({
		internal: true,
	}),
});

export const ApiCusFeatureV3Schema = z
	.object({
		id: z.string().meta({
			description: "The ID of the feature",
		}),
		type: z.enum(ApiFeatureType).meta({
			description: "The type of the feature",
		}),
		name: z.string().nullish().meta({
			description: "The name of the feature",
		}),
	})
	.extend(CoreCusFeatureSchema.shape);

export type ApiCusFeatureV3 = z.infer<typeof ApiCusFeatureV3Schema>;
export type ApiCusFeatureV3Rollover = z.infer<
	typeof ApiCusFeatureV3RolloverSchema
>;
export type ApiCusFeatureV3Breakdown = z.infer<
	typeof ApiCusFeatureV3BreakdownSchema
>;
