import { LineItemDiscountSchema } from "@models/billingModels/lineItem/lineItem.js";
import { z } from "zod/v4";

export const PreviewLineItemSchema = z.object({
	title: z.string(),
	description: z.string(),
	amount: z.number(),
	discounts: z.array(LineItemDiscountSchema).default([]),
	is_base: z.boolean().optional(),
	total_quantity: z.number(),
	paid_quantity: z.number(),
	plan_id: z.string(),
	deferred_for_trial: z.boolean().optional(),
	effective_period: z
		.object({
			start: z.number(),
			end: z.number(),
		})
		.optional(),
});

export type PreviewLineItem = z.infer<typeof PreviewLineItemSchema>;

export const BillingPreviewResponseSchema = z.object({
	customer_id: z.string(),
	line_items: z.array(PreviewLineItemSchema),

	total: z.number(),
	currency: z.string(),

	period_start: z.number().optional(),
	period_end: z.number().optional(),

	next_cycle: z
		.object({
			starts_at: z.number(),
			total: z.number(),
			line_items: z.array(PreviewLineItemSchema),
		})
		.optional(),
});

export type BillingPreviewResponse = z.infer<
	typeof BillingPreviewResponseSchema
>;
