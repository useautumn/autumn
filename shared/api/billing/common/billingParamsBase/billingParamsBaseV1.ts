import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0.js";
import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1.js";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../../../common/customerData.js";
import { EntityDataSchema } from "../../../common/entityData.js";
import { CustomizePlanV1Schema } from "../customizePlan/customizePlanV1.js";
import { TransitionRulesSchema } from "../transitionRules.js";

export const BillingParamsBaseV1Schema = z.object({
	customer_id: z.string(),
	entity_id: z.string().nullish(),

	feature_quantities: z.array(FeatureQuantityParamsV0Schema).nullish(),
	version: z.number().optional(),
	free_trial: FreeTrialParamsV1Schema.nullable().optional(),
	customize: CustomizePlanV1Schema.optional(),

	transition_rules: TransitionRulesSchema.optional().meta({
		internal: true,
	}),

	// Internal
	customer_data: CustomerDataSchema.optional().meta({
		internal: true,
	}),
	entity_data: EntityDataSchema.optional().meta({
		internal: true,
	}),
});

export type BillingParamsBaseV1 = z.infer<typeof BillingParamsBaseV1Schema>;
