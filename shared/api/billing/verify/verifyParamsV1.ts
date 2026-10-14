import { z } from "zod/v4";

export const VerifyParamsV1Schema = z.object({
	customer_id: z.string().meta({
		description:
			"Autumn customer whose Stripe subscriptions should be checked against Autumn's customer_products.",
	}),
	subscription_ids: z.array(z.string()).optional().meta({
		description:
			"Optional whitelist of Stripe subscription IDs to verify. Defaults to every subscription linked to the customer's plans, plus any other active Stripe subscription on the customer, which is reported as not linked to Autumn.",
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

const message = z.string().optional().meta({
	description: "Human-readable one-line description of the mismatch.",
});

const severity = z.enum(["error", "warning"]).optional().meta({
	description:
		"How serious the mismatch is — warnings (e.g. a Stripe-only subscription) can be deliberate.",
});

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
	plan_name: z.string().optional(),
	plan_id: z.string().optional().meta({
		description: "The Autumn plan this mismatch belongs to, when resolvable.",
	}),
	price_amount: z.number().optional(),
	price_interval: z.string().optional(),
	price_interval_count: z.number().optional(),
	phase_starts_at: z.number().optional().meta({
		description:
			"Present when the mismatch is inside a future scheduled phase rather than the current subscription.",
	}),
});
export type ItemMismatch = z.infer<typeof ItemMismatchSchema>;

export const BasePriceMismatchSchema = z.object({
	type: z.literal("base_price_mismatch"),
	message,
	severity,
	reason: z.enum(["missing", "unexpected", "amount_mismatch"]),
	expected_price_id: z.string().optional(),
	actual_price_id: z.string().optional(),
	expected_amount: z.string().optional(),
	actual_amount: z.string().optional(),
	plan_name: z.string().optional(),
	plan_id: z.string().optional().meta({
		description: "The Autumn plan this mismatch belongs to, when resolvable.",
	}),
	price_amount: z.number().optional(),
	price_interval: z.string().optional(),
	price_interval_count: z.number().optional(),
	expected_quantity: z.number().optional(),
	phase_starts_at: z.number().optional(),
});
export type BasePriceMismatch = z.infer<typeof BasePriceMismatchSchema>;

export const PrepaidQuantityMismatchSchema = z.object({
	type: z.literal("prepaid_quantity_mismatch"),
	message,
	severity,
	actual_price_id: z.string().optional().meta({
		description: "The Stripe price of the item this mismatch is about.",
	}),
	feature_id: z.string(),
	plan_id: z.string().optional().meta({
		description: "The Autumn plan this mismatch belongs to, when resolvable.",
	}),
	expected_quantity: z.number(),
	actual_quantity: z.number(),
	phase_starts_at: z.number().optional(),
});
export type PrepaidQuantityMismatch = z.infer<
	typeof PrepaidQuantityMismatchSchema
>;

export const PrepaidPriceMismatchSchema = z.object({
	type: z.literal("prepaid_price_mismatch"),
	message,
	severity,
	actual_price_id: z.string().optional().meta({
		description: "The Stripe price of the item this mismatch is about.",
	}),
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

export const StripeSubNotInAutumnMismatchSchema = z.object({
	type: z.literal("stripe_sub_not_in_autumn"),
	message,
	severity,
});
export type StripeSubNotInAutumnMismatch = z.infer<
	typeof StripeSubNotInAutumnMismatchSchema
>;

export const PlanOnEndingSubscriptionMismatchSchema = z.object({
	type: z.literal("plan_on_ending_subscription"),
	message,
	severity,
	ending_subscription_id: z.string(),
});
export type PlanOnEndingSubscriptionMismatch = z.infer<
	typeof PlanOnEndingSubscriptionMismatchSchema
>;

export const StaleSubscriptionLinkMismatchSchema = z.object({
	type: z.literal("stale_subscription_link"),
	message,
	severity,
});
export type StaleSubscriptionLinkMismatch = z.infer<
	typeof StaleSubscriptionLinkMismatchSchema
>;

export const ExpectedStateErrorMismatchSchema = z.object({
	type: z.literal("expected_state_error"),
	message,
	severity,
	error: z.string(),
});
export type ExpectedStateErrorMismatch = z.infer<
	typeof ExpectedStateErrorMismatchSchema
>;

export const SharedStripeCustomerMismatchSchema = z.object({
	type: z.literal("shared_stripe_customer"),
	message,
	severity,
	stripe_customer_id: z.string(),
	other_customer_ids: z.array(z.string()),
	other_customers: z
		.array(
			z.object({
				id: z.string(),
				name: z.string().nullable(),
				email: z.string().nullable(),
			}),
		)
		.optional(),
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
	PlanOnEndingSubscriptionMismatchSchema,
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
	customer_mismatches: z.array(SubscriptionMismatchSchema),
	subscriptions: z.array(SubscriptionVerifyResultSchema),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
