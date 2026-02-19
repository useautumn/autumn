import { LineItemDiscountSchema } from "@models/billingModels/lineItem/lineItem";
import { z } from "zod/v4";

export const BILLING_PREVIEW_RESPONSE_EXAMPLE = {
	customerId: "charles",
	lineItems: [
		{
			title: "Pro seed",
			description: "Pro seed - Base Price (from 18 Feb 2026 to 18 Mar 2026)",
			amount: 20,
			discounts: [],
		},
	],
	total: 20,
	currency: "usd",
};

export const ExtPreviewLineItemSchema = z.object({
	title: z.string().meta({ description: "The title of the line item." }),
	description: z
		.string()
		.meta({ description: "A detailed description of the line item." }),
	amount: z
		.number()
		.meta({ description: "The amount in cents for this line item." }),
	discounts: z.array(LineItemDiscountSchema).default([]).meta({
		description: "List of discounts applied to this line item.",
	}),
});

const PreviewLineItemSchema = ExtPreviewLineItemSchema.extend({
	plan_id: z.string().meta({ internal: true }),
	total_quantity: z.number().meta({ internal: true }),
	paid_quantity: z.number().meta({ internal: true }),
	deferred_for_trial: z.boolean().optional().meta({ internal: true }),
	effective_period: z
		.object({
			start: z.number(),
			end: z.number(),
		})
		.optional()
		.meta({ internal: true }),

	is_base: z.boolean().optional().meta({ internal: true }),
});

export const ExtBillingPreviewResponseSchema = z.object({
	customer_id: z.string().meta({ description: "The ID of the customer." }),
	line_items: z.array(ExtPreviewLineItemSchema).meta({
		description: "List of line items for the current billing period.",
	}),

	total: z.number().meta({
		description: "The total amount in cents for the current billing period.",
	}),
	currency: z.string().meta({
		description: "The three-letter ISO currency code (e.g., 'usd').",
	}),

	next_cycle: z
		.object({
			starts_at: z.number().meta({
				description:
					"Unix timestamp (milliseconds) when the next billing cycle starts.",
			}),
			total: z
				.number()
				.meta({ description: "The total amount in cents for the next cycle." }),
			line_items: z.array(PreviewLineItemSchema).meta({ internal: true }),
		})
		.optional()
		.meta({
			description:
				"Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles.",
		}),
});

export const BillingPreviewResponseSchema =
	ExtBillingPreviewResponseSchema.extend({
		line_items: z.array(PreviewLineItemSchema),
		period_start: z.number().optional().meta({ internal: true }),
		period_end: z.number().optional().meta({ internal: true }),
	});

export type ExtBillingPreviewResponse = z.infer<
	typeof ExtBillingPreviewResponseSchema
>;

export type PreviewLineItem = z.infer<typeof PreviewLineItemSchema>;
export type BillingPreviewResponse = z.infer<
	typeof BillingPreviewResponseSchema
>;
