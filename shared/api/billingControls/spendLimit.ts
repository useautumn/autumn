import type { z } from "zod/v4";
import { SpendLimitResponseSchema } from "../../models/cusModels/billingControls/spendLimit.js";

export const ApiSpendLimitSchema = SpendLimitResponseSchema;

export type ApiSpendLimit = z.infer<typeof ApiSpendLimitSchema>;
