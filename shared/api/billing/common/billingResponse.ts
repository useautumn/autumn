import { z } from "zod/v4";

export const PaymentFailureCodeEnum = z.enum([
	"3ds_required",
	"payment_method_required",
	"payment_failed",
]);

export type PaymentFailureCode = z.infer<typeof PaymentFailureCodeEnum>;

export const BillingResponseSchema = z.object({
	customer_id: z.string(),
	entity_id: z.string().optional(),

	invoice: z
		.object({
			status: z.string().nullable(),
			stripe_id: z.string(),
			total: z.number(),
			currency: z.string(),
			hosted_invoice_url: z.string().nullable(),
		})
		.optional(),

	payment_url: z.string().nullable(),

	required_action: z
		.object({
			code: PaymentFailureCodeEnum,
			reason: z.string(),
		})
		.optional(),
});

export type BillingResponse = z.infer<typeof BillingResponseSchema>;
