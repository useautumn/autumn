import { ApiFeatureType } from "@api/features/apiFeature.js";
import { EntInterval } from "@models/productModels/entModels/entEnums.js";
import { z } from "zod/v4";

export const ApiCusRolloverSchema = z.object({
	balance: z.number().meta({
		description: "The remaining balance amount that has rolled over",
		example: 100,
	}),
	expires_at: z.number().meta({
		description: "Timestamp when the rollover balance expires",
		example: 1759247877000,
	}),
});

// Version 3 of cus feature response
export const ApiCusFeatureBreakdownSchema = z.object({
	interval: z.enum(EntInterval).meta({
		description: "The billing interval for this feature breakdown",
		example: "month",
	}),
	interval_count: z.number().nullish().meta({
		description: "The number of intervals between resets",
		example: 1,
	}),
	balance: z.number().nullish().meta({
		description: "The remaining balance for this interval",
		example: 500,
	}),
	usage: z.number().nullish().meta({
		description: "The current usage amount",
		example: 250,
	}),
	included_usage: z.number().nullish().meta({
		description: "The amount of usage included in this interval",
		example: 1000,
	}),
	next_reset_at: z.number().nullish().meta({
		description: "Timestamp when the usage resets",
		example: 1759247877000,
	}),
	usage_limit: z.number().nullish().meta({
		description: "The maximum usage allowed",
		example: 1000,
	}),
	rollovers: z.array(ApiCusRolloverSchema).nullish().meta({
		description: "Array of rollover balances from previous periods",
		example: [{ balance: 100, expires_at: 1759247877000 }],
	}),
});

export const CoreCusFeatureSchema = z.object({
	interval: z.enum(EntInterval).or(z.literal("multiple")).nullish().meta({
		description: "The billing interval or 'multiple' if the feature has multiple intervals",
		example: "month",
	}),
	interval_count: z.number().nullish().meta({
		description: "The number of intervals between resets",
		example: 1,
	}),
	unlimited: z.boolean().nullish().meta({
		description: "Whether the feature has unlimited usage",
		example: false,
	}),
	balance: z.number().nullish().meta({
		description: "The remaining balance for this feature",
		example: 500,
	}),
	usage: z.number().nullish().meta({
		description: "The current usage amount",
		example: 250,
	}),
	included_usage: z.number().nullish().meta({
		description: "The amount of usage included",
		example: 1000,
	}),
	next_reset_at: z.number().nullish().meta({
		description: "Timestamp when the usage resets",
		example: 1759247877000,
	}),
	overage_allowed: z.boolean().nullish().meta({
		description: "Whether overage usage beyond the limit is allowed",
		example: true,
	}),

	breakdown: z.array(ApiCusFeatureBreakdownSchema).nullish().meta({
		description: "Detailed breakdown by interval for features with multiple intervals",
		example: [{ interval: "month", interval_count: 1, balance: 500, usage: 250 }],
	}),
	credit_schema: z
		.array(
			z.object({
				feature_id: z.string().meta({
					description: "The ID of the feature that credits are applied to",
					example: "feature_123",
				}),
				credit_amount: z.number().meta({
					description: "The amount of credits applied per usage",
					example: 10,
				}),
			}),
		)
		.nullish()
		.meta({
			description: "Credit conversion schema for credit system features",
			example: [{ feature_id: "feature_123", credit_amount: 10 }],
		}),

	usage_limit: z.number().nullish().meta({
		description: "The maximum usage allowed",
		example: 1000,
	}),
	rollovers: z.array(ApiCusRolloverSchema).nullish().meta({
		description: "Array of rollover balances from previous periods",
		example: [{ balance: 100, expires_at: 1759247877000 }],
	}),
});

export const ApiCusFeatureSchema = z
	.object({
		id: z.string().meta({
			description: "The unique identifier of the feature",
			example: "feature_123",
		}),
		type: z.enum(ApiFeatureType).meta({
			description: "The type of the feature",
			example: "single_use",
		}),
		name: z.string().nullish().meta({
			description: "The name of the feature",
			example: "API Calls",
		}),
	})
	.extend(CoreCusFeatureSchema.shape);

export type ApiCusFeature = z.infer<typeof ApiCusFeatureSchema>;
export type ApiCusRollover = z.infer<typeof ApiCusRolloverSchema>;
export type ApiCusFeatureBreakdown = z.infer<
	typeof ApiCusFeatureBreakdownSchema
>;
