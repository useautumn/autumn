import { AttachPreviewResponseSchema } from "@api/billing/common/attachPreviewResponse";
import { CustomerPlanChangeSchema } from "@api/billing/common/customerPlanChange";
import { PreviewBalanceChangeSchema } from "@api/billing/components/billingChanges/previewBalanceChange";
import { z } from "zod/v4";

export const ProcessorChangeSchema = z.object({
	type: z.enum(["subscription", "subscription_schedule"]),
	id: z.string().nullable(),
	action: z.enum(["created", "updated", "released", "canceled"]),
});

/** How Stripe bills one item. Amounts are in major currency units. */
export const ProcessorItemPriceSchema = z.object({
	currency: z.string(),
	unit_amount: z.number().nullable(),
	interval: z.enum(["day", "week", "month", "year"]).nullable(),
	interval_count: z.number(),
	usage_type: z.enum(["licensed", "metered"]),
	tiers_mode: z.enum(["graduated", "volume"]).nullable(),
	first_tier_amount: z.number().nullable(),
	units_per_quantity: z.number().nullable(),
});

/** One item Stripe will hold once a phase starts: the end state, not a diff. */
export const ProcessorItemSchema = z.object({
	price_id: z.string().nullable(),
	plan_id: z.string().nullable(),
	feature_id: z.string().nullable(),
	display_name: z.string(),
	feature_name: z.string().nullable(),
	quantity: z.number().nullable(),
	price: ProcessorItemPriceSchema.nullable(),
	amount: z.number().nullable(),
	creates_price: z.boolean(),
	managed_by_autumn: z.boolean(),
});

export const SetPlansPreviewPlanSchema = z.object({
	plan_id: z.string(),
	entity_id: z.string().nullable(),
	name: z.string(),
	status: z.enum(["starts", "ends", "updated", "kept"]),
	custom: z.boolean(),
	expires_at: z.number().nullable(),
	credit: z.number().nullable(),
	prices: z.array(
		z.object({
			feature_id: z.string().nullable(),
			price: ProcessorItemPriceSchema,
		}),
	),
});

export const SetPlansPreviewBalanceChangeSchema =
	PreviewBalanceChangeSchema.extend({
		behavior: z.enum(["added", "removed", "reset", "carried", "updated"]),
	});

export const SetPlansPreviewPhaseSchema = z.object({
	starts_at: z.number(),
	starts_now: z.boolean(),
	ends_subscription: z.boolean(),
	plans: z.array(SetPlansPreviewPlanSchema),
	plan_changes: z.array(CustomerPlanChangeSchema),
	balance_changes: z.array(SetPlansPreviewBalanceChangeSchema),
	processor_items: z.array(ProcessorItemSchema),
});

export const SetPlansPreviewWarningTypeSchema = z.enum([
	"unmanaged_stripe_item_removed",
	"usage_reset",
	"existing_schedule_replaced",
	"future_phase_removed",
	"pending_quantity_change_dropped",
	"new_stripe_price_created",
	"proration_disabled",
	"subscription_replaced",
	"new_stripe_subscription",
	"open_invoice_not_collected",
	"discount_not_carried",
	"trial_ended",
	"scheduled_cancel_changed",
	"interval_change_invoices_now",
	"usage_not_billed",
	"past_due_invoice_open",
	"cycle_reset",
]);

export const SetPlansPreviewWarningSchema = z.object({
	type: SetPlansPreviewWarningTypeSchema,
	severity: z.enum(["warning", "info"]),
	message: z.string(),
});

export const SetPlansPreviewChangesSchema = z.object({
	phases: z.array(SetPlansPreviewPhaseSchema).meta({
		description:
			"Each phase in start order, with the plans, balances and Stripe items it would hold.",
	}),
	processor_changes: z.array(ProcessorChangeSchema).meta({
		description:
			"The Stripe subscriptions and subscription schedules the request would create, update, release or cancel.",
	}),
	warnings: z.array(SetPlansPreviewWarningSchema).meta({
		description:
			"Side effects of the request worth confirming before it is sent, such as a replaced schedule or a reset balance.",
	}),
});

export const SetPlansPreviewResponseSchema = AttachPreviewResponseSchema.extend(
	SetPlansPreviewChangesSchema.shape,
);

export type ProcessorChange = z.infer<typeof ProcessorChangeSchema>;
export type ProcessorItemPrice = z.infer<typeof ProcessorItemPriceSchema>;
export type ProcessorItem = z.infer<typeof ProcessorItemSchema>;
export type SetPlansPreviewPlan = z.infer<typeof SetPlansPreviewPlanSchema>;
export type SetPlansPreviewBalanceChange = z.infer<
	typeof SetPlansPreviewBalanceChangeSchema
>;
export type SetPlansPreviewPhase = z.infer<typeof SetPlansPreviewPhaseSchema>;
export type SetPlansPreviewWarning = z.infer<
	typeof SetPlansPreviewWarningSchema
>;
export type SetPlansPreviewChanges = z.infer<
	typeof SetPlansPreviewChangesSchema
>;
export type SetPlansPreviewResponse = z.infer<
	typeof SetPlansPreviewResponseSchema
>;
