import { z } from "zod/v4";
import { PreviewBalanceChangeSchema } from "./previewBalanceChange.js";
import { PreviewFlagChangeSchema } from "./previewFlagChange.js";
import { PreviewPlanChangeSchema } from "./previewPlanChange.js";

export const PreviewMigrateCustomerSchema = z.object({
	object: z.literal("migration_customer_preview"),
	customer_id: z.string(),
	plan_changes: z.array(PreviewPlanChangeSchema),
	balance_changes: z.array(PreviewBalanceChangeSchema),
	flag_changes: z.array(PreviewFlagChangeSchema),
});

export type PreviewMigrateCustomer = z.infer<
	typeof PreviewMigrateCustomerSchema
>;
