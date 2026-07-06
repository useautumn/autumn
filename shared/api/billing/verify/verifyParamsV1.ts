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
});

export type VerifyParamsV1 = z.infer<typeof VerifyParamsV1Schema>;

const ItemMismatchReasonSchema = z.enum([
	"missing",
	"unexpected",
	"quantity_mismatch",
	"price_mismatch",
]);

/** A mismatch on a plain (non-prepaid, non-base) subscription item. */
export const ItemMismatchSchema = z.object({
	type: z.literal("item_mismatch"),
	reason: ItemMismatchReasonSchema,
	feature_id: z.string().optional(),
	expected_quantity: z.number().optional(),
	actual_quantity: z.number().optional(),
	phase_starts_at: z.number().optional().meta({
		description:
			"Present when the mismatch is inside a future scheduled phase rather than the current subscription.",
	}),
});
export type ItemMismatch = z.infer<typeof ItemMismatchSchema>;

/** A mismatch on the plan's base (fixed, non-feature) recurring price. */
export const BasePriceMismatchSchema = z.object({
	type: z.literal("base_price_mismatch"),
	reason: z.enum(["missing", "unexpected", "amount_mismatch"]),
	expected_amount: z.string().optional(),
	actual_amount: z.string().optional(),
	phase_starts_at: z.number().optional(),
});
export type BasePriceMismatch = z.infer<typeof BasePriceMismatchSchema>;

/** A prepaid feature item whose purchased quantity drifted from Autumn's record. */
export const PrepaidQuantityMismatchSchema = z.object({
	type: z.literal("prepaid_quantity_mismatch"),
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
	feature_id: z.string(),
	expected_unit_amount: z.string(),
	actual_unit_amount: z.string(),
	phase_starts_at: z.number().optional(),
});
export type PrepaidPriceMismatch = z.infer<typeof PrepaidPriceMismatchSchema>;

export const ScheduleMismatchSchema = z.object({
	type: z.literal("schedule_mismatch"),
	reason: z.enum([
		"missing_schedule",
		"unexpected_schedule",
		"phase_count_mismatch",
		"phase_start_mismatch",
		"billing_cycle_anchor_mismatch",
	]),
	expected_phase_count: z.number().optional(),
	actual_phase_count: z.number().optional(),
	phase_starts_at: z.number().optional(),
});
export type ScheduleMismatch = z.infer<typeof ScheduleMismatchSchema>;

export const CancelStateMismatchSchema = z.object({
	type: z.literal("cancel_state_mismatch"),
	expected_canceling: z.boolean(),
	actual_canceling: z.boolean(),
});
export type CancelStateMismatch = z.infer<typeof CancelStateMismatchSchema>;

export const RewardMismatchSchema = z.object({
	type: z.literal("reward_mismatch"),
	missing_reward_ids: z.array(z.string()),
	unexpected_reward_ids: z.array(z.string()),
});
export type RewardMismatch = z.infer<typeof RewardMismatchSchema>;

export const SubscriptionMismatchSchema = z.discriminatedUnion("type", [
	BasePriceMismatchSchema,
	ItemMismatchSchema,
	PrepaidQuantityMismatchSchema,
	PrepaidPriceMismatchSchema,
	ScheduleMismatchSchema,
	CancelStateMismatchSchema,
	RewardMismatchSchema,
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
	subscriptions: z.array(SubscriptionVerifyResultSchema),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
