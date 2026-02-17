import { LineItemDiscountSchema } from "@models/billingModels/lineItem/lineItem.js";
import { z } from "zod/v4";

export const PreviewLineItemSchema = z.object({
	title: z.string(),
	description: z.string(),
	amount: z.number(),
	discounts: z.array(LineItemDiscountSchema).default([]),
	plan_id: z.string(),
	total_quantity: z.number(),
	paid_quantity: z.number(),
	deferred_for_trial: z.boolean().optional(),
	effective_period: z
		.object({
			start: z.number(),
			end: z.number(),
		})
		.optional(),

	is_base: z.boolean().optional(),
});

export type PreviewLineItem = z.infer<typeof PreviewLineItemSchema>;

export const BillingPreviewResponseSchema = z.object({
	customer_id: z.string(),
	line_items: z.array(PreviewLineItemSchema),

	total: z.number(),
	currency: z.string(),

	period_start: z.number().optional(),
	period_end: z.number().optional(),

	// /** Credit from excess refund (e.g. unused time on previous plan exceeds new charge). Applied to next invoice(s) by Stripe. */
	// credit: z
	// 	.object({
	// 		amount: z.number(),
	// 		description: z.string(),
	// 	})
	// 	.optional(),

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
