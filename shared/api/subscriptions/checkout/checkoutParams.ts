import { z } from "zod/v4";
import {
	AttachBodySchema,
	ExtAttachBodySchema,
} from "../../core/attachModels.js";

export const ExtCheckoutParamsSchema = ExtAttachBodySchema.extend({
	setup_payment: z.boolean().optional(),
}).meta({
	description:
		"Returns a Stripe Checkout URL for the customer to make a payment, or returns payment confirmation information.",
});

export const CheckoutParamsSchema = AttachBodySchema.extend({
	// skip_checkout: z.boolean().optional(),
	setup_payment: z.boolean().optional(),
});

export type CheckoutParams = z.infer<typeof CheckoutParamsSchema>;
