import type { z } from "zod/v4";
import { DbSpendLimitSchema } from "../../models/cusModels/billingControls/spendLimit.js";

// Spend limits carry no runtime state on responses; the API shape is the stored shape.
export const ApiSpendLimitSchema = DbSpendLimitSchema;

export type ApiSpendLimit = z.infer<typeof ApiSpendLimitSchema>;
