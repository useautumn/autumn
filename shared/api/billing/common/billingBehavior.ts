import { z } from "zod/v4";

export const BillingBehaviorSchema = z.enum([
	"prorate_immediately",
	"next_cycle_only",
]);

export type BillingBehavior = z.infer<typeof BillingBehaviorSchema>;
