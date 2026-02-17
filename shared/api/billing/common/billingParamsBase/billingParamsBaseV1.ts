import { FeatureOptionsParamsV0Schema } from "@api/billing/common/featureOptions/featureOptionsParamsV0.js";
import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1.js";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../../../common/customerData.js";
import { EntityDataSchema } from "../../../common/entityData.js";
import { CustomizePlanV1Schema } from "../customizePlan/customizePlanV1.js";

export const BillingParamsBaseV1Schema = z.object({
	customer_id: z.string(),
	entity_id: z.string().nullish(),
	customer_data: CustomerDataSchema.optional(),
	entity_data: EntityDataSchema.optional(),

	// Used for both update and attach
	options: z.array(FeatureOptionsParamsV0Schema).nullish(),
	version: z.number().optional(),

	free_trial: FreeTrialParamsV1Schema.nullable().optional(),
	customize: CustomizePlanV1Schema.optional(),
});

export type BillingParamsBaseV1 = z.infer<typeof BillingParamsBaseV1Schema>;
