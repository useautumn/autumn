import { z } from "zod/v4";

export const PaymentFailureCodeEnum = z
	.enum(["3ds_required", "payment_method_required", "payment_failed"])
	.meta({
		description:
			"The type of payment failure. '3ds_required' means 3D Secure authentication is needed, 'payment_method_required' means the customer needs to add a payment method, 'payment_failed' means the payment was declined.",
	});

export type PaymentFailureCode = z.infer<typeof PaymentFailureCodeEnum>;

export const BillingResponseRequiredActionSchema = z.object({
	code: PaymentFailureCodeEnum.meta({
		description: "The type of action required to complete the payment.",
	}),
	reason: z.string().meta({
		description: "A human-readable explanation of why this action is required.",
	}),
});

export const BillingResponseSchema = z.object({
	customer_id: z.string().meta({ description: "The ID of the customer." }),
	entity_id: z.string().optional().meta({
		description: "The ID of the entity, if the plan was attached to an entity.",
	}),

	invoice: z
		.object({
			status: z.string().nullable().meta({
				description:
					"The status of the invoice (e.g., 'paid', 'open', 'draft').",
			}),
			stripe_id: z.string().meta({
				description: "The Stripe invoice ID.",
			}),
			total: z.number().meta({
				description: "The total amount of the invoice in cents.",
			}),
			currency: z.string().meta({
				description: "The three-letter ISO currency code (e.g., 'usd').",
			}),
			hosted_invoice_url: z.string().nullable().meta({
				description:
					"URL to the hosted invoice page where the customer can view and pay the invoice.",
			}),
		})
		.optional()
		.meta({
			description:
				"Invoice details if an invoice was created. Only present when a charge was made.",
		}),

	payment_url: z.string().nullable().meta({
		description:
			"URL to redirect the customer to complete payment. Null if no payment action is required.",
	}),
	required_action: BillingResponseRequiredActionSchema.optional().meta({
		description:
			"Details about any action required to complete the payment. Present when the payment could not be processed automatically.",
	}),
});

export type BillingResponse = z.infer<typeof BillingResponseSchema>;
export type BillingResponseRequiredAction = z.infer<
	typeof BillingResponseRequiredActionSchema
>;
