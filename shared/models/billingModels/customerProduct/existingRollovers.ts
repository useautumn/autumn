import { RolloverSchema } from "@models/cusProductModels/cusEntModels/rolloverModels/rolloverTable";
import { BillingType } from "@models/productModels/priceModels/priceEnums";
import { z } from "zod/v4";

export const ExistingRolloverSchema = RolloverSchema.extend({
	internal_feature_id: z.string(),
	// Source-item identity (billing type + reset interval); used to rank
	// candidate cusEnts when a plan has multiple items for the same feature.
	source_billing_type: z.enum(BillingType).nullish(),
	source_interval: z.string().nullish(),
	source_interval_count: z.number().nullish(),
});

export type ExistingRollover = z.infer<typeof ExistingRolloverSchema>;
