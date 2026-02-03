import { FreeTrialParamsV0Schema } from "@api/billing/common/freeTrial/freeTrialParamsV0.js";
import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels.js";
import { ProductItemSchema } from "@models/productV2Models/productItemModels/productItemModels.js";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData.js";
import { EntityDataSchema } from "../../common/entityData.js";

export const BillingParamsBaseSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string().nullish(),
	customer_data: CustomerDataSchema.optional(),
	entity_data: EntityDataSchema.optional(),

	// Used for both update and attach
	options: z.array(FeatureOptionsSchema).nullish(),
	version: z.number().optional(),
	free_trial: FreeTrialParamsV0Schema.nullable().optional(),
	items: z.array(ProductItemSchema).optional(),
});

export type BillingParamsBase = z.infer<typeof BillingParamsBaseSchema>;
