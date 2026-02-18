import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0.js";
import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1.js";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../../../common/customerData.js";
import { EntityDataSchema } from "../../../common/entityData.js";
import { CustomizePlanV1Schema } from "../customizePlan/customizePlanV1.js";
import { TransitionRulesSchema } from "../transitionRules.js";

export const BillingParamsBaseV1Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer to attach the plan to.",
	}),
	entity_id: z.string().nullish().meta({
		description: "The ID of the entity to attach the plan to.",
	}),

	feature_quantities: z.array(FeatureQuantityParamsV0Schema).nullish().meta({
		description:
			"If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan.",
	}),
	version: z.number().optional().meta({
		description: "The version of the plan to attach.",
	}),
	free_trial: FreeTrialParamsV1Schema.nullable().optional(),
	customize: CustomizePlanV1Schema.optional().meta({
		description:
			"Customize the plan to attach. Can either override the price of the plan, the items in the plan, or both.",
	}),

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
