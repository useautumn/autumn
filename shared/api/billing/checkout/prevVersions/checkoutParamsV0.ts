import { z } from "zod/v4";
import {
	AttachBodyV0Schema,
	ExtAttachBodyV0Schema,
} from "../../../billing/attach/prevVersions/attachBodyV0.js";

export const ExtCheckoutParamsV0Schema = ExtAttachBodyV0Schema.safeExtend({
	setup_payment: z.boolean().optional(),
}).meta({
	description:
		"Returns a Stripe Checkout URL for the customer to make a payment, or returns payment confirmation information.",
});

export const CheckoutParamsV0Schema = AttachBodyV0Schema.safeExtend({
	setup_payment: z.boolean().optional(),
});

export type CheckoutParamsV0 = z.infer<typeof CheckoutParamsV0Schema>;
