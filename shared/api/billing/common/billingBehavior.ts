import { z } from "zod/v4";

export const BillingBehaviorSchema = z
	.enum(["prorate_immediately", "none"])
	.meta({
		title: "BillingBehavior",
		description:
			"How to handle billing. 'prorate_immediately' charges/credits prorated amounts now, 'none' does not charge/credit anything.",
	});

export type BillingBehavior = z.infer<typeof BillingBehaviorSchema>;
