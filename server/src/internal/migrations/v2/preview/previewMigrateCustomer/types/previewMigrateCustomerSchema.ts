import {
	CustomerPlanChangeSchema,
	PreviewBalanceChangeSchema,
	PreviewFlagChangeSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

export const PreviewMigrateCustomerSchema = z.object({
	object: z.literal("migration_customer_preview"),
	customer_id: z.string(),
	plan_changes: z.array(CustomerPlanChangeSchema),
	balance_changes: z.array(PreviewBalanceChangeSchema),
	flag_changes: z.array(PreviewFlagChangeSchema),
});

export type PreviewMigrateCustomer = z.infer<
	typeof PreviewMigrateCustomerSchema
>;
