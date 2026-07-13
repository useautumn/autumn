import type { z } from "zod/v4";
import {
	DbUsageAlertSchema,
	UsageAlertThresholdType,
} from "../../models/cusModels/billingControls/usageAlert.js";
import { BillingControlSourceSchema } from "./billingControlSource.js";

export const ApiUsageAlertSchema = DbUsageAlertSchema.extend({
	source: BillingControlSourceSchema.optional(),
});
export { UsageAlertThresholdType };

export type ApiUsageAlert = z.infer<typeof ApiUsageAlertSchema>;
