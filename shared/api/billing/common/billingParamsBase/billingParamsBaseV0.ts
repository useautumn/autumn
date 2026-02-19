import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0";
import { TransitionRulesSchema } from "@api/billing/common/transitionRules";
import { FreeTrialParamsV0Schema } from "@api/common/freeTrial/freeTrialParamsV0";
import { ProductItemSchema } from "@models/productV2Models/productItemModels/productItemModels";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../../../common/customerData";
import { EntityDataSchema } from "../../../common/entityData";

export const BillingParamsBaseV0Schema = z.object({
	customer_id: z.string(),
	entity_id: z.string().optional(),
	customer_data: CustomerDataSchema.optional(),
	entity_data: EntityDataSchema.optional(),

	// Used for both update and attach
	options: z.array(FeatureQuantityParamsV0Schema).optional(),
	version: z.number().optional(),
	free_trial: FreeTrialParamsV0Schema.nullable().optional(),
	items: z.array(ProductItemSchema).optional(),

	transition_rules: TransitionRulesSchema.optional(),
});

export type BillingParamsBaseV0 = z.infer<typeof BillingParamsBaseV0Schema>;
