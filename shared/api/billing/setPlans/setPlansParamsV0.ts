import { z } from "zod/v4";
import { ms } from "../../../utils/common/unixUtils";
import { CarryOverUsagesSchema } from "../common/carryOverUsages";
import { UnixMsTimestampSchema } from "../common/unixMsTimestamp";
import {
	CreateScheduleParamsV0BaseSchema,
	createScheduleTimingIssues,
	schedulePhaseBillingIssues,
} from "../createSchedule/createScheduleParamsV0";
import { RemoveDiscountsSchema } from "../updateSubscription/removeDiscount";

/** A first phase starting within this of now starts now: further back it backdates, further ahead it starts later. */
export const SET_PLANS_FIRST_PHASE_TOLERANCE_MS = ms.minutes(15);

export const SetPlansParamsV0Schema = CreateScheduleParamsV0BaseSchema.omit({
	billing_behavior: true,
	billing_cycle_anchor: true,
})
	.extend({
		phases: CreateScheduleParamsV0BaseSchema.shape.phases.meta({
			description:
				"Ordered phase definitions. Together with unscheduled_plans they are the full list of the customer's plans in the request's scope: a current plan none of them lists ends now (with credit per the first phase's proration_behavior), and a plan a later phase leaves out ends when that phase starts. One-off purchases are never ended. The first phase may start at a future starts_at: the current plans in scope end now (with credit per the first phase's proration_behavior) and billing starts on that date.",
		}),
		enable_plan_immediately: z.boolean().optional().meta({
			description:
				"If true, the first phase's plans are activated immediately even when billing starts later: on a future first phase starts_at they are usable now and first billed on that date, and with Stripe checkout they are inserted before the customer completes the hosted form.",
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
		remove_discounts: RemoveDiscountsSchema.optional().meta({
			description:
				"Discounts to remove from the subscription, by reward ID. Discounts not listed are left unchanged; when the subscription is recreated, the rest carry over.",
		}),
		carry_over_usages: CarryOverUsagesSchema.meta({
			description:
				"Carry the consumable usage of a plan the first phase replaces onto the plan replacing it, instead of billing it now. Only valid when a plan is replaced immediately; usage of features left out of feature_ids is billed now.",
		}),
	})
	.check((ctx) => {
		const issues = [
			...createScheduleTimingIssues(ctx.value.phases),
			...schedulePhaseBillingIssues({ phases: ctx.value.phases }),
		];
		for (const issue of issues) {
			ctx.issues.push({ code: "custom", input: ctx.value, ...issue });
		}
	});

export type SetPlansParamsV0 = z.infer<typeof SetPlansParamsV0Schema>;
export type SetPlansParamsV0Input = z.input<typeof SetPlansParamsV0Schema>;
