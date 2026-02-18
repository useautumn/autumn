import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0.js";
import { TransitionRulesSchema } from "@api/billing/common/transitionRules.js";
import { FreeTrialParamsV0Schema } from "@api/common/freeTrial/freeTrialParamsV0.js";
import { ProductItemSchema } from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../../../common/customerData.js";
import { EntityDataSchema } from "../../../common/entityData.js";

export const BillingParamsBaseV0Schema = z.object({
	customer_id: z.string(),
	entity_id: z.string().nullish(),
	customer_data: CustomerDataSchema.optional(),
	entity_data: EntityDataSchema.optional(),

	// Used for both update and attach
	options: z.array(FeatureQuantityParamsV0Schema).nullish(),
	version: z.number().optional(),
	free_trial: FreeTrialParamsV0Schema.nullable().optional(),
	items: z.array(ProductItemSchema).optional(),

	transition_rules: TransitionRulesSchema.optional(),
});

export type BillingParamsBaseV0 = z.infer<typeof BillingParamsBaseV0Schema>;
