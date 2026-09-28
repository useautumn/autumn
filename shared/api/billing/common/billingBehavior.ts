import { z } from "zod/v4";

export const BillingBehaviorSchema = z
	.enum(["prorate_immediately", "none", "bill_difference"])
	.meta({
		title: "BillingBehavior",
		description:
			"How to handle billing. 'prorate_immediately' charges/credits prorated amounts now, 'none' does not charge/credit anything, 'bill_difference' charges/credits the full-period price difference now without changing the billing cycle.",
	});

export type BillingBehavior = z.infer<typeof BillingBehaviorSchema>;
