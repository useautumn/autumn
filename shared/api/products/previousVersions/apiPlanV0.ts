import { BasePriceSchema } from "@api/products/components/basePrice/basePrice.js";
import { AttachScenario } from "@models/checkModels/checkPreviewModels.js";
import { AppEnv } from "@models/genModels/genEnums.js";
import { z } from "zod/v4";
import { ApiFreeTrialV2Schema } from "../components/apiFreeTrialV2.js";
import { ApiPlanItemV0Schema } from "../items/previousVersions/apiPlanItemV0.js";

export {
	type ApiFreeTrialV2,
	ApiFreeTrialV2Schema,
} from "../components/apiFreeTrialV2.js";

export const ApiPlanV0Schema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	group: z.string().nullable(),

	version: z.number(),
	add_on: z.boolean(),
	default: z.boolean(),

	// Change
	price: BasePriceSchema.nullable(),

	features: z.array(ApiPlanItemV0Schema),
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

export type ApiPlan = z.infer<typeof ApiPlanV0Schema>;
