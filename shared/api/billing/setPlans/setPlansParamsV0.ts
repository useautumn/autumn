import { z } from "zod/v4";
import { ms } from "../../../utils/common/unixUtils";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { BillingCycleAnchorSchema } from "../common/billingCycleAnchor";
import { UnixMsTimestampSchema } from "../common/unixMsTimestamp";
import {
	CreateScheduleParamsV0BaseSchema,
	createScheduleTimingIssues,
} from "../createSchedule/createScheduleParamsV0";

/** A first phase starting within this of now starts now: further back it backdates, further ahead it starts later. */
export const SET_PLANS_FIRST_PHASE_TOLERANCE_MS = ms.minutes(15);

export const SetPlansParamsV0Schema = CreateScheduleParamsV0BaseSchema.omit({
	billing_behavior: true,
	billing_cycle_anchor: true,
})
	.extend({
		phases: CreateScheduleParamsV0BaseSchema.shape.phases.meta({
			description:
				"Ordered phase definitions. Together with unscheduled_plans they are the full list of the customer's plans in the request's scope: a current plan none of them lists ends now (with credit per proration_behavior), and a plan a later phase leaves out ends when that phase starts. One-off purchases are never ended. The first phase may start at a future starts_at: the current plans in scope end now (with credit per proration_behavior) and billing starts on that date.",
		}),
		enable_plan_immediately: z.boolean().optional().meta({
			description:
				"If true, the first phase's plans are activated immediately even when billing starts later: on a future first phase starts_at they are usable now and first billed on that date, and with Stripe checkout they are inserted before the customer completes the hosted form.",
		}),
		proration_behavior: BillingBehaviorSchema.optional().meta({
			description:
				"How to handle proration for the immediate phase. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges, 'bill_difference' charges/credits the full-period price difference now without changing the billing cycle.",
		}),
		billing_cycle_anchor: BillingCycleAnchorSchema.optional().meta({
			description:
				"Pass 'now' to reset the billing cycle of the immediate phase to the current time, or a future timestamp in epoch milliseconds to anchor the cycle on that date.",
		}),
		stripe_subscription_id: z.string().min(1).optional().meta({
			description:
				"The Stripe subscription to edit when the customer has several. Only plans billed on it, and free plans, are changed; new paid plans bill on it.",
			internal: true,
		}),
		undeclared_plans: z.enum(["end", "retain"]).optional().meta({
			description:
				"What happens to a current plan in the request's scope that no phase or unscheduled plan lists: 'end' (default) ends it now, 'retain' keeps it running until a listed plan claims its group.",
			internal: true,
		}),
		ends_at: UnixMsTimestampSchema.optional().meta({
			description:
				"Unix timestamp in milliseconds for when the plans should end. The Stripe subscription is cancelled on that date.",
		}),
		billing_behavior: z
			.never({
				error:
					"billing_behavior is not supported by set_plans. Use proration_behavior instead.",
			})
			.optional()
			.meta({ internal: true }),
	})
	.check((ctx) => {
		for (const issue of createScheduleTimingIssues(ctx.value.phases)) {
			ctx.issues.push({ code: "custom", input: ctx.value, ...issue });
		}
	});

export type SetPlansParamsV0 = z.infer<typeof SetPlansParamsV0Schema>;
export type SetPlansParamsV0Input = z.input<typeof SetPlansParamsV0Schema>;
