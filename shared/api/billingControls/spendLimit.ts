import type { z } from "zod/v4";
import { DbSpendLimitSchema } from "../../models/cusModels/billingControls/spendLimit.js";
import { BillingControlSourceSchema } from "./billingControlSource.js";

export const ApiSpendLimitSchema = DbSpendLimitSchema.extend({
	source: BillingControlSourceSchema.optional(),
});

export type ApiSpendLimit = z.infer<typeof ApiSpendLimitSchema>;
