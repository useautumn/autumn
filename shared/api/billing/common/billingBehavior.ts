import { z } from "zod/v4";

export const BillingBehaviorSchema = z
	.enum(["prorate_immediately", "next_cycle_only"])
	.meta({
		description:
			"How to handle billing. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' waits until the next billing cycle.",
	});

export type BillingBehavior = z.infer<typeof BillingBehaviorSchema>;
