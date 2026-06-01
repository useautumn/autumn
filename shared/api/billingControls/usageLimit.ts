import type { z } from "zod/v4";
import { DbUsageLimitSchema } from "../../models/cusModels/billingControls/usageLimit.js";

export const ApiUsageLimitSchema = DbUsageLimitSchema;

export type ApiUsageLimit = z.infer<typeof ApiUsageLimitSchema>;
