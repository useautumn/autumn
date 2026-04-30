import { ExpandParamSchema } from "@api/common/expandParam";
import { z } from "zod/v4";
import { BillingPreviewChangeSchema } from "./billingPreviewChange";

export const BILLING_PREVIEW_RESPONSE_EXAMPLE = {
	customerId: "charles",
	lineItems: [
		{
			display_name: "Pro seed",
			description: "Pro seed - Base Price (from 18 Feb 2026 to 18 Mar 2026)",
			subtotal: 20,
			total: 20,
			discounts: [],
		},
	],
	subtotal: 20,
	total: 20,
	currency: "usd",
};

export const PreviewLineItemDiscountSchema = z.object({
	amount_off: z.number(),
	percent_off: z.number().optional(),
	reward_id: z.string().optional(),
	reward_name: z.string().optional(),
});

export const PreviewTaxSchema = z.object({
	total: z.number().meta({
		description:
			"Total tax amount in the response's major currency unit. Sum of inclusive + exclusive taxes computed by Stripe Tax across all positive line items. Negative (credit) lines are excluded from tax computation per Stripe's behavior.",
	}),
	amount_inclusive: z.number().meta({
		description:
			"Tax portion in major units that is INCLUDED in line item subtotals (when line items use `tax_behavior: inclusive`). Currently always 0 — autumn line items use exclusive tax behavior — but exposed for forward compatibility.",
	}),
	amount_exclusive: z.number().meta({
		description:
			"Tax portion in major units that will be ADDED ON TOP of line item subtotals.",
	}),
	currency: z.string().meta({
		description:
			"Three-letter ISO currency code (lowercase). Matches the response's top-level `currency`.",
	}),
	status: z.enum(["complete", "incomplete"]).meta({
		description:
			"Autumn-side status. 'complete' means Stripe Tax computed the calculation successfully (zero is a valid complete result, e.g. tax-free jurisdictions). 'incomplete' means we caught a Stripe error (typically because the customer's location couldn't be resolved); totals will be zero.",
	}),
});

export type PreviewTax = z.infer<typeof PreviewTaxSchema>;

export const ExtPreviewLineItemSchema = z.object({
	display_name: z.string().meta({
		description:
			"The name of the line item to display to the customer if you're building a UI. It will either be the plan name or the feature name.",
	}),

	description: z
		.string()
		.meta({ description: "A detailed description of the line item." }),
	subtotal: z.number().meta({
		description: "The amount in cents before discounts for this line item.",
	}),
	total: z.number().meta({
		description:
			"The final amount in cents after discounts for this line item.",
	}),
	discounts: z.array(PreviewLineItemDiscountSchema).default([]).meta({
		description: "List of discounts applied to this line item.",
	}),
	plan_id: z.string().meta({
		description: "The ID of the plan that this line item belongs to.",
	}),
	feature_id: z.string().nullable().meta({
		description: "The ID of the feature that this line item belongs to.",
	}),

	period: z
		.object({
			start: z.number().meta({
				description:
					"The start of the period in milliseconds since the Unix epoch.",
			}),
			end: z.number().meta({
				description:
					"The end of the period in milliseconds since the Unix epoch.",
			}),
		})
		.optional()
		.meta({
			description:
				"The period of time that this line item is being charged for.",
		}),
	quantity: z.number().meta({ description: "The quantity of the line item." }),
});

export const PreviewLineItemSchema = ExtPreviewLineItemSchema.extend({
	object: z.literal("billing_preview_line_item").meta({ internal: true }),
	custom: z.boolean().meta({ internal: true }),
});

export const PreviewUsageLineItemSchema = PreviewLineItemSchema.pick({
	display_name: true,
	plan_id: true,
	feature_id: true,
	period: true,
});

export const ExtBillingPreviewResponseSchema = z.object({
	customer_id: z.string().meta({ description: "The ID of the customer." }),
	line_items: z.array(ExtPreviewLineItemSchema).meta({
		description: "List of line items for the current billing period.",
	}),
	subtotal: z.number().meta({
		description:
			"The total amount in cents before discounts for the current billing period.",
	}),

	total: z.number().meta({
		description:
			"The final amount in cents after discounts for the current billing period.",
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
			subtotal: z.number().meta({
				description:
					"The total amount in cents before discounts for the next cycle.",
			}),
			total: z.number().meta({
				description:
					"The final amount in cents after discounts for the next cycle.",
			}),
			line_items: z.array(PreviewLineItemSchema).meta({
				description: "List of line items for the next billing cycle.",
			}),

			usage_line_items: z.array(PreviewUsageLineItemSchema).meta({
				description:
					"List of line items for usage-based features in the next cycle.",
			}),
		})
		.optional()
		.meta({
			description:
				"Preview of the next billing cycle, if applicable. This shows what the customer will be charged in subsequent cycles.",
		}),

	expand: ExpandParamSchema,
	incoming: z.array(BillingPreviewChangeSchema).meta({
		description: "Products or subscription changes being added or updated.",
	}),
	outgoing: z.array(BillingPreviewChangeSchema).meta({
		description: "Products or subscription changes being removed or ended.",
	}),

	refund: z
		.object({
			amount: z.number().meta({
				description:
					"The refund amount that will be issued, accounting for any prior partial refunds.",
			}),
			invoice: z
				.object({
					stripe_id: z.string(),
					total: z.number(),
					current_refunded_amount: z.number(),
					currency: z.string(),
				})
				.meta({
					description: "The invoice that will be refunded.",
				}),
		})
		.optional()
		.meta({
			internal: true,
			description:
				"Refund preview for cancel-with-refund flows. Only present when refund_last_payment is set.",
		}),
});

export const BillingPreviewResponseSchema =
	ExtBillingPreviewResponseSchema.extend({
		object: z.literal("billing_preview").meta({ internal: true }),
		line_items: z.array(PreviewLineItemSchema),
	});

export type ExtBillingPreviewResponse = z.infer<
	typeof ExtBillingPreviewResponseSchema
>;

export type PreviewLineItemDiscount = z.infer<
	typeof PreviewLineItemDiscountSchema
>;
export type PreviewLineItem = z.infer<typeof PreviewLineItemSchema>;
export type PreviewUsageLineItem = z.infer<typeof PreviewUsageLineItemSchema>;
export type BillingPreviewResponse = z.infer<
	typeof BillingPreviewResponseSchema
>;
