import { z } from "zod/v4";

/** A targeted request would change a plan billed on another subscription. */
export const SetPlansSubscriptionConflictSchema = z.object({
	type: z.literal("plan_on_another_subscription"),
	conflict: z.enum(["replaces", "already_billed"]),
	requested_plan_name: z.string(),
	conflicting_plan_name: z.string(),
	stripe_subscription_id: z.string(),
	subscription_plan_name: z.string(),
});

/** A targeted request would change a plan Autumn bills outside any Stripe subscription. */
export const SetPlansPlanOutsideSubscriptionSchema = z.object({
	type: z.literal("plan_outside_subscription"),
	requested_plan_name: z.string(),
});

/** A new paid plan's interval differs from the targeted subscription's. */
export const SetPlansIntervalMismatchSchema = z.object({
	type: z.literal("billing_interval_mismatch"),
	requested_plan_name: z.string(),
	requested_interval: z.string(),
	subscription_plan_name: z.string(),
	subscription_interval: z.string(),
});

/** New paid plans bill in a currency the targeted subscription doesn't. */
export const SetPlansCurrencyMismatchSchema = z.object({
	type: z.literal("currency_mismatch"),
	subscription_plan_name: z.string(),
	subscription_currency: z.string(),
	requested_currency: z.string(),
});

/** The targeted subscription bills none of the customer's plans any more. */
export const SetPlansSubscriptionNotLinkedSchema = z.object({
	type: z.literal("subscription_not_linked"),
	stripe_subscription_id: z.string(),
});

/** An ongoing plan's group is also scheduled by a later phase. */
export const SetPlansOngoingPlanClashSchema = z.object({
	type: z.literal("ongoing_plan_clash"),
	plan_name: z.string(),
});

/** The schedule needs more phases than Stripe allows. */
export const SetPlansTooManyPhasesSchema = z.object({
	type: z.literal("too_many_phases"),
	phase_count: z.number(),
	max_phases: z.number(),
});

/** Moving off a free plan later needs a $0 Stripe subscription. */
export const SetPlansFreePlanNeedsStripeSchema = z.object({
	type: z.literal("free_plan_needs_stripe"),
	plan_name: z.string(),
});

/** A date sits on the wrong side of a phase or the end date. */
export const SetPlansDateOrderSchema = z.object({
	type: z.literal("date_order"),
	date: z.enum(["end_date", "billing_cycle_anchor"]),
	date_ms: z.number(),
	boundary: z.enum(["last_phase", "next_phase", "end_date"]),
	boundary_ms: z.number(),
});

/** A first phase that starts later can't take something that bills or anchors now. */
export const SetPlansFutureStartConflictSchema = z.object({
	type: z.literal("future_start_conflict"),
	conflict: z.enum(["free_trial", "invoice_mode", "billing_cycle_anchor"]),
	starts_at: z.number(),
});

/** Nothing in Stripe would start this plan when a later first phase begins. */
export const SetPlansPlanCannotStartLaterSchema = z.object({
	type: z.literal("plan_cannot_start_later"),
	plan_name: z.string(),
	starts_at: z.number(),
});

export const SetPlansErrorDetailsSchema = z.discriminatedUnion("type", [
	SetPlansSubscriptionConflictSchema,
	SetPlansPlanOutsideSubscriptionSchema,
	SetPlansIntervalMismatchSchema,
	SetPlansCurrencyMismatchSchema,
	SetPlansSubscriptionNotLinkedSchema,
	SetPlansOngoingPlanClashSchema,
	SetPlansTooManyPhasesSchema,
	SetPlansFreePlanNeedsStripeSchema,
	SetPlansDateOrderSchema,
	SetPlansFutureStartConflictSchema,
	SetPlansPlanCannotStartLaterSchema,
]);

export type SetPlansErrorDetails = z.infer<typeof SetPlansErrorDetailsSchema>;
export type SetPlansSubscriptionConflict = z.infer<
	typeof SetPlansSubscriptionConflictSchema
>;
