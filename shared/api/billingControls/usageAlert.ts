import type { z } from "zod/v4";
import {
	DbUsageAlertSchema,
	UsageAlertThresholdType,
} from "../../models/cusModels/billingControls/usageAlert.js";

export const ApiUsageAlertSchema = DbUsageAlertSchema;
export { UsageAlertThresholdType };

export type ApiUsageAlert = z.infer<typeof ApiUsageAlertSchema>;
