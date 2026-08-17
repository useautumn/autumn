import { z } from "zod/v4";

export const VerifyParamsV1Schema = z.object({
	customer_id: z.string().meta({
		description:
			"Autumn customer whose Stripe subscriptions should be checked against Autumn's customer_products.",
	}),
	subscription_ids: z.array(z.string()).optional().meta({
		description:
			"Optional whitelist of Stripe subscription IDs to verify. Defaults to every paid-recurring subscription on the customer.",
	}),
	strict: z.boolean().optional().meta({
		description:
			"When true, report missing usage-based items and unexpected metered Stripe items. Defaults to false.",
	}),
});

export type VerifyParamsV1 = z.infer<typeof VerifyParamsV1Schema>;

const ItemMismatchReasonSchema = z.enum([
	"missing",
	"unexpected",
	"quantity_mismatch",
	"price_mismatch",
]);

/** Stamped onto every mismatch by the verify action — display it as-is. */
const message = z.string().optional().meta({
	description: "Human-readable one-line description of the mismatch.",
});

/** Stamped onto every mismatch by the verify action. */
const severity = z.enum(["error", "warning"]).optional().meta({
	description:
		"How serious the mismatch is — warnings (e.g. a Stripe-only subscription) can be deliberate.",
});

/** A mismatch on a plain (non-prepaid, non-base) subscription item. */
export const ItemMismatchSchema = z.object({
	type: z.literal("item_mismatch"),
	message,
	severity,
	reason: ItemMismatchReasonSchema,
	expected_price_id: z.string().optional(),
	actual_price_id: z.string().optional(),
	price_type: z.enum(["usage", "prepaid", "allocated", "fixed"]).optional(),
	feature_id: z.string().optional(),
	expected_quantity: z.number().optional(),
	actual_quantity: z.number().optional(),
	/** Display context: plan name + major-unit price, when resolvable. */
	plan_name: z.string().optional(),
	price_amount: z.number().optional(),
	price_interval: z.string().optional(),
	price_interval_count: z.number().optional(),
	phase_starts_at: z.number().optional().meta({
		description:
			"Present when the mismatch is inside a future scheduled phase rather than the current subscription.",
	}),
});
export type ItemMismatch = z.infer<typeof ItemMismatchSchema>;

/** A mismatch on the plan's base (fixed, non-feature) recurring price. */
export const BasePriceMismatchSchema = z.object({
	type: z.literal("base_price_mismatch"),
	message,
	severity,
	reason: z.enum(["missing", "unexpected", "amount_mismatch"]),
	expected_price_id: z.string().optional(),
	actual_price_id: z.string().optional(),
	expected_amount: z.string().optional(),
	actual_amount: z.string().optional(),
	/** Display context: plan name + major-unit price (e.g. Pro at 300/mo). */
	plan_name: z.string().optional(),
	price_amount: z.number().optional(),
	price_interval: z.string().optional(),
	price_interval_count: z.number().optional(),
	expected_quantity: z.number().optional(),
	phase_starts_at: z.number().optional(),
});
export type BasePriceMismatch = z.infer<typeof BasePriceMismatchSchema>;

/** A prepaid feature item whose purchased quantity drifted from Autumn's record. */
export const PrepaidQuantityMismatchSchema = z.object({
	type: z.literal("prepaid_quantity_mismatch"),
	message,
	severity,
	feature_id: z.string(),
	expected_quantity: z.number(),
	actual_quantity: z.number(),
	phase_starts_at: z.number().optional(),
});
export type PrepaidQuantityMismatch = z.infer<
	typeof PrepaidQuantityMismatchSchema
>;

/** A prepaid feature item whose inline (customer-specific) unit price drifted. */
export const PrepaidPriceMismatchSchema = z.object({
	type: z.literal("prepaid_price_mismatch"),
	message,
	severity,
	feature_id: z.string(),
	expected_unit_amount: z.string(),
	actual_unit_amount: z.string(),
	phase_starts_at: z.number().optional(),
});
export type PrepaidPriceMismatch = z.infer<typeof PrepaidPriceMismatchSchema>;

export const ScheduleMismatchSchema = z.object({
	type: z.literal("schedule_mismatch"),
	message,
	severity,
	reason: z.enum([
		"missing_schedule",
		"unexpected_schedule",
		"phase_count_mismatch",
		"phase_start_mismatch",
		"billing_cycle_anchor_mismatch",
	]),
	expected_phase_count: z.number().optional(),
	actual_phase_count: z.number().optional(),
	/** Upcoming phase start times (unix seconds) on the unexpected schedule. */
	actual_phase_starts_at: z.array(z.number()).optional(),
	phase_starts_at: z.number().optional(),
});
export type ScheduleMismatch = z.infer<typeof ScheduleMismatchSchema>;

export const CancelStateMismatchSchema = z.object({
	type: z.literal("cancel_state_mismatch"),
	message,
	severity,
	expected_canceling: z.boolean(),
	actual_canceling: z.boolean(),
});
export type CancelStateMismatch = z.infer<typeof CancelStateMismatchSchema>;

export const RewardMismatchSchema = z.object({
	type: z.literal("reward_mismatch"),
	message,
	severity,
	missing_reward_ids: z.array(z.string()),
	unexpected_reward_ids: z.array(z.string()),
});
export type RewardMismatch = z.infer<typeof RewardMismatchSchema>;

/** An active Stripe subscription with no Autumn customer products linked to it. */
export const StripeSubNotInAutumnMismatchSchema = z.object({
	type: z.literal("stripe_sub_not_in_autumn"),
	message,
	severity,
});
export type StripeSubNotInAutumnMismatch = z.infer<
	typeof StripeSubNotInAutumnMismatchSchema
>;

/** Autumn products link to a Stripe subscription outside the customer's active set. */
export const StaleSubscriptionLinkMismatchSchema = z.object({
	type: z.literal("stale_subscription_link"),
	message,
	severity,
});
export type StaleSubscriptionLinkMismatch = z.infer<
	typeof StaleSubscriptionLinkMismatchSchema
>;

/** Autumn's expected Stripe state couldn't be computed for this subscription
 * (e.g. a price with no Stripe link) — drift is unknown, not absent. */
export const ExpectedStateErrorMismatchSchema = z.object({
	type: z.literal("expected_state_error"),
	message,
	severity,
	error: z.string(),
});
export type ExpectedStateErrorMismatch = z.infer<
	typeof ExpectedStateErrorMismatchSchema
>;

/** More than one Autumn customer points at the same Stripe customer — invoices
 * and subscriptions from different Autumn customers collide on one Stripe account. */
export const SharedStripeCustomerMismatchSchema = z.object({
	type: z.literal("shared_stripe_customer"),
	message,
	severity,
	stripe_customer_id: z.string(),
	other_customer_ids: z.array(z.string()),
});
export type SharedStripeCustomerMismatch = z.infer<
	typeof SharedStripeCustomerMismatchSchema
>;

export const SubscriptionMismatchSchema = z.discriminatedUnion("type", [
	BasePriceMismatchSchema,
	ItemMismatchSchema,
	PrepaidQuantityMismatchSchema,
	PrepaidPriceMismatchSchema,
	ScheduleMismatchSchema,
	CancelStateMismatchSchema,
	RewardMismatchSchema,
	StripeSubNotInAutumnMismatchSchema,
	StaleSubscriptionLinkMismatchSchema,
	ExpectedStateErrorMismatchSchema,
	SharedStripeCustomerMismatchSchema,
]);
export type SubscriptionMismatch = z.infer<typeof SubscriptionMismatchSchema>;

export const SubscriptionVerifyResultSchema = z.object({
	stripe_subscription_id: z.string(),
	status: z.enum(["correct", "mismatched"]),
	mismatches: z.array(SubscriptionMismatchSchema),
});
export type SubscriptionVerifyResult = z.infer<
	typeof SubscriptionVerifyResultSchema
>;

export const VerifyResponseSchema = z.object({
	customer_id: z.string(),
	/** Account-level findings not tied to a single subscription. */
	customer_mismatches: z.array(SubscriptionMismatchSchema),
	subscriptions: z.array(SubscriptionVerifyResultSchema),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
