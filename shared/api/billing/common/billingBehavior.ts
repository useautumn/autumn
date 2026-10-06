import { z } from "zod/v4";

export const BillingBehaviorSchema = z
	.enum(["prorate_immediately", "none", "bill_difference"])
	.meta({
		title: "BillingBehavior",
		description:
			"How to handle billing. 'prorate_immediately' charges/credits prorated amounts now, 'none' does not charge/credit anything, 'bill_difference' charges/credits the full-period price difference now without changing the billing cycle.",
	});

export type BillingBehavior = z.infer<typeof BillingBehaviorSchema>;

export const PhaseProrationBehaviorSchema = BillingBehaviorSchema.exclude(
	["bill_difference"],
	{
		error:
			"A later phase's proration_behavior must be 'prorate_immediately' or 'none'. 'bill_difference' is only supported on the immediate phase.",
	},
).meta({
	title: "PhaseProrationBehavior",
	description:
		"How the change when a later phase starts is billed. 'prorate_immediately' invoices the prorated difference at the phase start, 'none' skips it.",
});

export type PhaseProrationBehavior = z.infer<
	typeof PhaseProrationBehaviorSchema
>;
