import { PlanChangeV0Schema } from "@api/products/components/planChange/planChangeV0.js";
import {
	type PlanItemChangeV0,
	PlanItemChangeV0Schema,
} from "@api/products/components/planChange/planItemChangeV0.js";
import { z } from "zod/v4";

export const PlanChangeActionEnum = z.enum([
	"activated",
	"scheduled",
	"updated",
	"expired",
]);

export const SubscriptionStatusEnum = z.enum([
	"active",
	"scheduled",
	"expired",
]);

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
		description:
			"Start of the current billing period, or null if not applicable.",
	}),
	current_period_end: z.number().nullable().meta({
		description:
			"End of the current billing period, or null if not applicable.",
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

/** @deprecated Use PlanItemChangeV0Schema. */
export const CustomerPlanItemChangeSchema = PlanItemChangeV0Schema;

/** Sparse lifecycle scalars that changed, holding their previous values. */
export const CustomerPlanPreviousAttributesSchema =
	SubscriptionSnapshotSchema.pick({
		status: true,
		past_due: true,
		canceled_at: true,
		expires_at: true,
		trial_ends_at: true,
	}).partial();

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
	previous_attributes: CustomerPlanPreviousAttributesSchema.nullable().meta({
		description:
			"Sparse map of lifecycle scalar fields whose values changed, holding their previous values. Null when the plan is newly activated or scheduled, or when no lifecycle field changed.",
	}),
	plan_change: PlanChangeV0Schema.optional().meta({
		description:
			"Content-level change to the plan definition for this customer plan (items, base price, free trial).",
	}),
	item_changes: z.array(PlanItemChangeV0Schema).default([]).meta({
		deprecated: true,
		description:
			"Deprecated — use plan_change.item_changes. Features that were added to or removed from this plan.",
	}),
});

export type PlanChangeAction = z.infer<typeof PlanChangeActionEnum>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;
export type PurchaseStatus = z.infer<typeof PurchaseStatusEnum>;
export type SubscriptionSnapshot = z.infer<typeof SubscriptionSnapshotSchema>;
export type PurchaseSnapshot = z.infer<typeof PurchaseSnapshotSchema>;
export type CustomerPlanPreviousAttributes = z.infer<
	typeof CustomerPlanPreviousAttributesSchema
>;
/** @deprecated Use PlanItemChangeV0. */
export type CustomerPlanItemChange = PlanItemChangeV0;
export type CustomerPlanChange = z.infer<typeof CustomerPlanChangeSchema>;
