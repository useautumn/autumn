import { z } from "zod/v4";

export const SetPlansSubscriptionConflictSchema = z.object({
	type: z.literal("plan_on_another_subscription"),
	conflict: z.enum(["replaces", "already_billed"]),
	requested_plan_name: z.string(),
	conflicting_plan_name: z.string(),
	stripe_subscription_id: z.string(),
	subscription_plan_name: z.string(),
});

export const SetPlansPlanOutsideSubscriptionSchema = z.object({
	type: z.literal("plan_outside_subscription"),
	requested_plan_name: z.string(),
});

export const SetPlansIntervalMismatchSchema = z.object({
	type: z.literal("billing_interval_mismatch"),
	requested_plan_name: z.string(),
	requested_interval: z.string(),
	subscription_plan_name: z.string(),
	subscription_interval: z.string(),
});

export const SetPlansCurrencyMismatchSchema = z.object({
	type: z.literal("currency_mismatch"),
	subscription_plan_name: z.string(),
	subscription_currency: z.string(),
	requested_currency: z.string(),
});

export const SetPlansSubscriptionNotLinkedSchema = z.object({
	type: z.literal("subscription_not_linked"),
	stripe_subscription_id: z.string(),
});

export const SetPlansOngoingPlanClashSchema = z.object({
	type: z.literal("ongoing_plan_clash"),
	plan_name: z.string(),
});

export const SetPlansTooManyPhasesSchema = z.object({
	type: z.literal("too_many_phases"),
	phase_count: z.number(),
	max_phases: z.number(),
});

export const SetPlansFreePlanNeedsStripeSchema = z.object({
	type: z.literal("free_plan_needs_stripe"),
	plan_name: z.string(),
});

export const SetPlansDateOrderSchema = z.object({
	type: z.literal("date_order"),
	date: z.enum(["end_date", "billing_cycle_anchor"]),
	date_ms: z.number(),
	boundary: z.enum(["last_phase", "next_phase", "end_date"]),
	boundary_ms: z.number(),
});

export const SetPlansFutureStartConflictSchema = z.object({
	type: z.literal("future_start_conflict"),
	conflict: z.enum(["free_trial", "invoice_mode", "billing_cycle_anchor"]),
	starts_at: z.number(),
});

export type SetPlansFutureStartConflict = z.infer<
	typeof SetPlansFutureStartConflictSchema
>["conflict"];

export const SetPlansPlanCannotStartLaterSchema = z.object({
	type: z.literal("plan_cannot_start_later"),
	plan_name: z.string(),
	starts_at: z.number(),
});

export const SetPlansBackdateConflictSchema = z.object({
	type: z.literal("backdate_conflict"),
	conflict: z.enum([
		"free_trial",
		"stripe_checkout",
		"period_ended",
		"billing_cycle_anchor",
		"too_far_back",
		"plan_outside_request",
	]),
	starts_at: z.number(),
	plan_name: z.string().optional(),
});

export type SetPlansBackdateConflict = z.infer<
	typeof SetPlansBackdateConflictSchema
>["conflict"];

/** Stripe can't reset a trialing subscription's cycle now: the trial end anchors it. */
export const SetPlansTrialingCycleResetSchema = z.object({
	type: z.literal("trialing_cycle_reset"),
	trial_ends_at: z.number(),
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
	SetPlansBackdateConflictSchema,
	SetPlansTrialingCycleResetSchema,
]);

export type SetPlansErrorDetails = z.infer<typeof SetPlansErrorDetailsSchema>;
export type SetPlansSubscriptionConflict = z.infer<
	typeof SetPlansSubscriptionConflictSchema
>;
