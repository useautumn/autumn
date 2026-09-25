import type { AttachPreviewResponse } from "@api/billing/common/attachPreviewResponse";
import { CustomerPlanChangeSchema } from "@api/billing/common/customerPlanChange";
import { PreviewBalanceChangeSchema } from "@api/billing/components/billingChanges/previewBalanceChange";
import { z } from "zod/v4";

export const ProcessorChangeSchema = z.object({
	type: z.enum(["subscription", "subscription_schedule"]),
	processor: z.literal("stripe"),
	id: z.string().nullable(),
	action: z.enum(["created", "updated", "released", "canceled"]),
	phase_count: z.number().optional(),
});

export const ProcessorItemPriceTierSchema = z.object({
	up_to: z.number().nullable(),
	unit_amount: z.number().nullable(),
	flat_amount: z.number().nullable(),
});

/** How Stripe bills one item. Amounts are in major currency units. */
export const ProcessorItemPriceSchema = z.object({
	currency: z.string(),
	unit_amount: z.number().nullable(),
	interval: z.enum(["day", "week", "month", "year"]).nullable(),
	interval_count: z.number(),
	usage_type: z.enum(["licensed", "metered"]),
	tiers_mode: z.enum(["graduated", "volume"]).nullable(),
	tiers: z.array(ProcessorItemPriceTierSchema).nullable(),
	units_per_quantity: z.number().nullable(),
});

/** One item Stripe will hold once a phase starts: the end state, not a diff. */
export const ProcessorItemSchema = z.object({
	item_id: z.string().nullable(),
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

export const SetPlansPreviewPhaseSchema = z.object({
	starts_at: z.number(),
	plan_changes: z.array(CustomerPlanChangeSchema),
	balance_changes: z.array(PreviewBalanceChangeSchema),
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
]);

export const SetPlansPreviewWarningSchema = z.object({
	type: SetPlansPreviewWarningTypeSchema,
	message: z.string(),
});

export const SetPlansPreviewChangesSchema = z.object({
	phases: z.array(SetPlansPreviewPhaseSchema),
	processor_changes: z.array(ProcessorChangeSchema),
	warnings: z.array(SetPlansPreviewWarningSchema),
});

export type ProcessorChange = z.infer<typeof ProcessorChangeSchema>;
export type ProcessorItemPriceTier = z.infer<
	typeof ProcessorItemPriceTierSchema
>;
export type ProcessorItemPrice = z.infer<typeof ProcessorItemPriceSchema>;
export type ProcessorItem = z.infer<typeof ProcessorItemSchema>;
export type SetPlansPreviewPhase = z.infer<typeof SetPlansPreviewPhaseSchema>;
export type SetPlansPreviewWarning = z.infer<
	typeof SetPlansPreviewWarningSchema
>;
export type SetPlansPreviewChanges = z.infer<
	typeof SetPlansPreviewChangesSchema
>;
export type SetPlansPreviewResponse = AttachPreviewResponse &
	SetPlansPreviewChanges;
