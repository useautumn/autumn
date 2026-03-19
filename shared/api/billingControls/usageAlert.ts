import type { z } from "zod/v4";
import { DbUsageAlertSchema } from "../../models/cusModels/billingControls/usageAlert.js";

export const ApiUsageAlertSchema = DbUsageAlertSchema;

export type ApiUsageAlert = z.infer<typeof ApiUsageAlertSchema>;
