import { ApiFeatureType } from "@api/features/apiFeature.js";
import { EntInterval } from "@models/productModels/entModels/entEnums.js";
import { z } from "zod/v4";

export const ApiCusFeatureV3RolloverSchema = z.object({
	balance: z.number().meta({
		description: "The remaining balance amount that has rolled over",
	}),
	expires_at: z.number().meta({
		description: "Timestamp when the rollover balance expires",
	}),
});

// Version 3 of cus feature response
export const ApiCusFeatureV3BreakdownSchema = z.object({
	interval: z.enum(EntInterval).meta({
		description: "The billing interval for this feature breakdown",
	}),
	interval_count: z.number().nullish().meta({
		description: "The number of intervals between resets",
	}),
	balance: z.number().nullish().meta({
		description: "The remaining balance for this interval",
	}),
	usage: z.number().nullish().meta({
		description: "The current usage amount",
	}),
	included_usage: z.number().nullish().meta({
		description: "The amount of usage included in this interval",
	}),
	next_reset_at: z.number().nullish().meta({
		description: "Timestamp when the usage resets",
	}),
	usage_limit: z.number().nullish().meta({
		description: "The maximum usage allowed",
	}),
	rollovers: z.array(ApiCusFeatureV3RolloverSchema).nullish().meta({
		description: "Array of rollover balances from previous periods",
	}),
});

export const CoreCusFeatureSchema = z.object({
	interval: z.enum(EntInterval).or(z.literal("multiple")).nullish().meta({
		description:
			"The billing interval or 'multiple' if the feature has multiple intervals",
	}),
	interval_count: z.number().nullish().meta({
		description: "The number of intervals between resets",
	}),
	unlimited: z.boolean().nullish().meta({
		description: "Whether the feature has unlimited usage",
	}),
	balance: z.number().nullish().meta({
		description: "The remaining balance for this feature",
	}),
	usage: z.number().nullish().meta({
		description: "The current usage amount",
	}),
	included_usage: z.number().nullish().meta({
		description: "The amount of usage included",
	}),
	next_reset_at: z.number().nullish().meta({
		description: "Timestamp when the usage resets",
	}),
	overage_allowed: z.boolean().nullish().meta({
		description: "Whether overage usage beyond the limit is allowed",
		example: true,
	}),

	breakdown: z
		.array(ApiCusFeatureV3BreakdownSchema)
		.nullish()
		.meta({
			description:
				"Detailed breakdown by interval for features with multiple intervals",
			example: [
				{ interval: "month", interval_count: 1, balance: 500, usage: 250 },
			],
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
	rollovers: z
		.array(ApiCusFeatureV3RolloverSchema)
		.nullish()
		.meta({
			description: "Array of rollover balances from previous periods",
			example: [{ balance: 100, expires_at: 1759247877000 }],
		}),
});

export const ApiCusFeatureV3Schema = z
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

export type ApiCusFeatureV3 = z.infer<typeof ApiCusFeatureV3Schema>;
export type ApiCusFeatureV3Rollover = z.infer<
	typeof ApiCusFeatureV3RolloverSchema
>;
export type ApiCusFeatureV3Breakdown = z.infer<
	typeof ApiCusFeatureV3BreakdownSchema
>;
