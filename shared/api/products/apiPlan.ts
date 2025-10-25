import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import { BillingInterval } from "@models/productModels/priceModels/priceEnums.js";
import { z } from "zod/v4";
import { ApiPlanFeatureSchema } from "./planFeature/apiPlanFeature.js";

// Re-export for backward compatibility
export { ResetInterval } from "./planEnums.js";

export const ApiFreeTrialV2Schema = z.object({
	duration_type: z.enum(FreeTrialDuration),
	duration_length: z.number(),
	card_required: z.boolean(),
});

export type ApiFreeTrialV2 = z.infer<typeof ApiFreeTrialV2Schema>;

export const ApiPlanSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	group: z.string().nullable(),

	version: z.number(),

	add_on: z.boolean(),
	default: z.boolean(),

	// Change
	price: z
		.object({
			amount: z.number(),
			interval: z.enum(BillingInterval),
			interval_count: z.number().optional(),
			// tiers: z.array(UsageTierSchema).optional(),
		})
		.nullable(),

	features: z.array(ApiPlanFeatureSchema),
	free_trial: ApiFreeTrialV2Schema.nullable().optional(),

	// Misc
	created_at: z.number(),
	env: z.enum(AppEnv),
	archived: z.boolean(),
	base_variant_id: z.string().nullable().meta({
		description: "ID of the base variant this product is derived from",
		example: "var_1234567890abcdef",
	}),

	customer_context: z
		.object({
			trial_available: z.boolean(),
			scenario: z.enum(AttachScenario),
		})
		.optional(),
});

export type ApiPlan = z.infer<typeof ApiPlanSchema>;

// CUSTOMER

// export const ApiCusFeatureBreakdownSchema = z.object({
// 	granted: z.number(),
// 	balance: z.number(),
// 	usage: z.number(),
// 	resets_at: z.number().nullable(),

// 	reset_interval: z.enum(ResetInterval),
// 	reset_interval_count: z.number().optional(),
// });

// export const ApiCusFeatureSchema = z.object({
// 	feature_id: z.string(),

// 	unlimited: z.boolean(),
// 	granted: z.number().nullable(),
// 	balance: z.number(),
// 	usage: z.number(),
// 	resets_at: z.number().nullable(),

// 	reset_interval: z.enum(ResetInterval),
// 	reset_interval_count: z.number().optional(),

// 	breakdown: z.array(ApiCusFeatureBreakdownSchema).nullish(),
// 	rollovers: z.array(ApiCusRolloverSchema).nullish(),
// });

// export const ApiCusProductSchema = z.object({
// 	product_id: z.string(),

// 	status: z.enum(["active"]),
// 	cancels_at: z.number().nullable(),
// 	started_at: z.number(),

// 	current_period_start: z.number().nullable(),
// 	current_period_end: z.number().nullable(),

// 	// Less common
// 	quantity: z.number(),
// 	entity_id: z.string().nullable(),
// });

// export const ApiCustomerSchema = z.object({
// 	id: z.string(),
// 	name: z.string().nullable(),
// 	email: z.string().nullable(),
// 	created_at: z.number(),
// 	fingerprint: z.string().nullable(),
// 	stripe_id: z.string().nullable(),
// 	env: z.enum(AppEnv),
// 	metadata: z.record(z.any(), z.any()),

// 	products: z.array(ApiCusProductSchema),
// 	features: z.record(z.string(), ApiCusFeatureSchema),
// });
