import { z } from "zod/v4";

export const PlanChangeActionEnum = z.enum([
	"activated",
	"scheduled",
	"updated",
	"expired",
]);

export const CustomerPlanStatusEnum = z.enum([
	"active",
	"trialing",
	"past_due",
	"scheduled",
	"expired",
	"paused",
]);

export const CustomerPlanSnapshotSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the customer plan.",
	}),
	status: CustomerPlanStatusEnum.meta({
		description: "The current status of the plan on the customer.",
	}),
	started_at: z.number().nullable().meta({
		description: "When the plan started, in milliseconds since the Unix epoch.",
	}),
	canceled_at: z.number().nullable().meta({
		description:
			"When the plan was canceled, in milliseconds since the Unix epoch, or null if not canceled.",
	}),
	expires_at: z.number().nullable().meta({
		description:
			"When the plan ends, in milliseconds since the Unix epoch, or null if no expiry is set.",
	}),
	current_period_start: z.number().nullable().meta({
		description: "Start of the current billing period, or null if not applicable.",
	}),
	current_period_end: z.number().nullable().meta({
		description: "End of the current billing period, or null if not applicable.",
	}),
});

export const CustomerPlanItemChangeSchema = z.object({
	action: z.enum(["created", "deleted"]).meta({
		description: "Whether the feature was added to or removed from the plan.",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature that was added or removed.",
	}),
});

export const CustomerPlanChangeSchema = z.object({
	action: PlanChangeActionEnum.meta({
		description:
			"The lifecycle action applied to this plan: activated (newly active on the customer), scheduled (queued for a future start), updated (mutated in place), or expired (ended).",
	}),
	plan: CustomerPlanSnapshotSchema.meta({
		description: "The plan as it stands after this change.",
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
export type CustomerPlanStatus = z.infer<typeof CustomerPlanStatusEnum>;
export type CustomerPlanSnapshot = z.infer<typeof CustomerPlanSnapshotSchema>;
export type CustomerPlanItemChange = z.infer<typeof CustomerPlanItemChangeSchema>;
export type CustomerPlanChange = z.infer<typeof CustomerPlanChangeSchema>;
