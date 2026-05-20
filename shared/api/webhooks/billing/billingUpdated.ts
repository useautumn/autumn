import { BillingChangeResponseSchema } from "../../billing/common/billingChangeResponse.js";

/**
 * Webhook payload schema for `billing.updated`. Re-exports
 * `BillingChangeResponseSchema` so the public webhook contract stays
 * coupled to the same response shape the action layer produces.
 */
export const BillingUpdatedSchema = BillingChangeResponseSchema.meta({
	examples: [
		{
			object: "billing.updated",
			customer_id: "cus_123",
			plan_changes: [
				{
					action: "activated",
					subscription: {
						plan_id: "pro",
						status: "active",
						past_due: false,
						started_at: 1779000000000,
						canceled_at: null,
						expires_at: null,
						trial_ends_at: null,
						current_period_start: 1779000000000,
						current_period_end: 1781592000000,
					},
					previous_attributes: null,
					item_changes: [],
				},
				{
					action: "expired",
					subscription: {
						plan_id: "free",
						status: "expired",
						past_due: false,
						started_at: 1776000000000,
						canceled_at: 1779000000000,
						expires_at: 1779000000000,
						trial_ends_at: null,
						current_period_start: null,
						current_period_end: null,
					},
					previous_attributes: { status: "active" },
					item_changes: [],
				},
			],
			tags: [],
		},
	],
});
