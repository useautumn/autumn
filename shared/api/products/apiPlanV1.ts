import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { z } from "zod/v4";
import { ApiFreeTrialV2Schema } from "./components/apiFreeTrialV2.js";
import { DisplaySchema } from "./components/display.js";
import { ApiPlanItemV1Schema } from "./items/apiPlanItemV1.js";

export const ApiPlanV1Schema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	group: z.string().nullable(),

	version: z.number(),
	add_on: z.boolean(),
	auto_enable: z.boolean(),

	price: z
		.object({
			amount: z.number(),
			interval: z.enum(BillingInterval),
			interval_count: z.number().optional(),
			display: DisplaySchema.optional(),
		})
		.nullable(),

	items: z.array(ApiPlanItemV1Schema),
	free_trial: ApiFreeTrialV2Schema.optional(),

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
