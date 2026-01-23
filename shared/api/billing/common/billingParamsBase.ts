import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData.js";
import { EntityDataSchema } from "../../common/entityData.js";

export const BillingParamsBaseSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string().nullish(),
	customer_data: CustomerDataSchema.optional(),
	entity_data: EntityDataSchema.optional(),
});

export type BillingParamsBase = z.infer<typeof BillingParamsBaseSchema>;
