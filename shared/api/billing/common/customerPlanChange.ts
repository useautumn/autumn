import { z } from "zod/v4";
import { ApiPlanItemV1Schema } from "../../products/items/apiPlanItemV1.js";

export const PlanChangeActionEnum = z.enum([
	"activated",
	"scheduled",
	"updated",
	"expired",
]);

export const SubscriptionStatusEnum = z.enum(["active", "scheduled", "expired"]);

export const PurchaseStatusEnum = z.enum(["active", "scheduled", "expired"]);

export const SubscriptionSnapshotSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the customer plan.",
	}),
	status: SubscriptionStatusEnum.meta({
		description: "The current status of the subscription on the customer.",
	}),
	past_due: z.boolean().meta({
		description: "Whether the subscription has overdue payments.",
	}),
	started_at: z.number().nullable().meta({
		description:
			"When the subscription started, in milliseconds since the Unix epoch.",
	}),
	canceled_at: z.number().nullable().meta({
		description:
			"When the subscription was canceled, in milliseconds since the Unix epoch, or null if not canceled.",
	}),
	expires_at: z.number().nullable().meta({
		description:
			"When the subscription ends, in milliseconds since the Unix epoch, or null if no expiry is set.",
	}),
	trial_ends_at: z.number().nullable().meta({
		description:
			"When the trial ends, in milliseconds since the Unix epoch. Null when not actively trialing.",
	}),
	current_period_start: z.number().nullable().meta({
		description: "Start of the current billing period, or null if not applicable.",
	}),
	current_period_end: z.number().nullable().meta({
		description: "End of the current billing period, or null if not applicable.",
	}),
});

export const PurchaseSnapshotSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the customer plan.",
	}),
	status: PurchaseStatusEnum.meta({
		description: "The current status of the purchase on the customer.",
	}),
	expires_at: z.number().nullable().meta({
		description:
			"When the purchase ends, in milliseconds since the Unix epoch, or null if no expiry is set.",
	}),
});

export const CustomerPlanItemChangeSchema = z.object({
	action: z.enum(["created", "deleted"]).meta({
		description: "Whether the feature was added to or removed from the plan.",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature that was added or removed.",
	}),
	item: ApiPlanItemV1Schema.meta({
		description: "The item snapshot that was added or removed.",
	}),
});

export const CustomerPlanChangeSchema = z.object({
	action: PlanChangeActionEnum.meta({
		description:
			"The lifecycle action applied to this plan: activated (newly active on the customer), scheduled (queued for a future start), updated (mutated in place), or expired (ended).",
	}),
	subscription: SubscriptionSnapshotSchema.optional().meta({
		description:
			"The subscription as it stands after this change. Present when the plan is billed as a recurring subscription.",
	}),
	purchase: PurchaseSnapshotSchema.optional().meta({
		description:
			"The purchase as it stands after this change. Present when the plan is a one-off purchase.",
	}),
	previous_attributes: z
		.record(z.string(), z.unknown())
		.nullable()
		.meta({
			description:
				"Sparse map of scalar fields whose values changed, holding their previous values. Null when the plan is newly activated or scheduled.",
		}),
	item_changes: z
		.array(CustomerPlanItemChangeSchema)
		.default([])
		.meta({
			description:
				"Features that were added to or removed from this plan. Only populated for updated plans.",
		}),
});

export type PlanChangeAction = z.infer<typeof PlanChangeActionEnum>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;
export type PurchaseStatus = z.infer<typeof PurchaseStatusEnum>;
export type SubscriptionSnapshot = z.infer<typeof SubscriptionSnapshotSchema>;
export type PurchaseSnapshot = z.infer<typeof PurchaseSnapshotSchema>;
export type CustomerPlanItemChange = z.infer<typeof CustomerPlanItemChangeSchema>;
export type CustomerPlanChange = z.infer<typeof CustomerPlanChangeSchema>;
