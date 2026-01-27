import { ApiFreeTrialV2Schema } from "@api/products/apiPlan.js";
import { ApiPlanFeatureV1Schema } from "@api/products/planFeature/apiPlanFeatureV1.js";
import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { z } from "zod/v4";
import { DisplaySchema } from "./components/display.js";

export const ApiPlanV1Schema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	group: z.string().nullable(),

	version: z.number(),
	add_on: z.boolean(),
	auto_enable: z.boolean(),

	// Change
	price: z
		.object({
			amount: z.number(),
			interval: z.enum(BillingInterval),
			interval_count: z.number().optional(),
			display: DisplaySchema.optional(),
		})
		.nullable(),

	features: z.array(ApiPlanFeatureV1Schema),
	free_trial: ApiFreeTrialV2Schema.nullable().optional(),

	// Misc
	created_at: z.number(),
	env: z.enum(AppEnv),
	archived: z.boolean(),
	base_variant_id: z.string().nullable(),

	customer_eligibility: z
		.object({
			trial_available: z.boolean().optional(),
			scenario: z.enum(AttachScenario),
		})
		.optional(),
});

export type ApiPlanV1 = z.infer<typeof ApiPlanV1Schema>;
