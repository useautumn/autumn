import type { z } from "zod/v4";
import { DbSpendLimitSchema } from "../../models/cusModels/billingControls/spendLimit.js";

export const ApiSpendLimitSchema = DbSpendLimitSchema;

export type ApiSpendLimit = z.infer<typeof ApiSpendLimitSchema>;
