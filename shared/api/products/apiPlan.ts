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
