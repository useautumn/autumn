import type { z } from "zod/v4";
import { DbOverageAllowedSchema } from "../../models/cusModels/billingControls/overageAllowed.js";
import { BillingControlSourceSchema } from "./billingControlSource.js";

export const ApiOverageAllowedSchema = DbOverageAllowedSchema.extend({
	source: BillingControlSourceSchema.optional(),
});

export type ApiOverageAllowed = z.infer<typeof ApiOverageAllowedSchema>;
