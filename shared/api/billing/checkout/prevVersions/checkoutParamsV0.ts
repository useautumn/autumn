import {
	AttachBodySchema,
	ExtAttachBodySchema,
} from "@api/core/attachModels.js";
import { z } from "zod/v4";

export const ExtCheckoutParamsV0Schema = ExtAttachBodySchema.extend({
	setup_payment: z.boolean().optional(),
}).meta({
	description:
		"Returns a Stripe Checkout URL for the customer to make a payment, or returns payment confirmation information.",
});

export const CheckoutParamsV0Schema = AttachBodySchema.extend({
	setup_payment: z.boolean().optional(),
});

// // RESULT
// export const CheckoutLineV0Schema = z.object({
// 	description: z.string(),
// 	amount: z.number(),
// 	item: ApiProductItemSchema.nullish(),
// });

// export const CheckoutResponseV0Schema = z.object({
// 	url: z.string().nullish(),
// 	customer_id: z.string(),
// 	lines: z.array(CheckoutLineV0Schema),
// 	product: ApiProductSchema.nullish(),
// 	current_product: ApiProductSchema.nullish(),
// 	options: z.array(FeatureOptionsSchema).nullish(),
// 	total: z.number().nullish(),
// 	currency: z.string().nullish(),
// 	has_prorations: z.boolean().nullish(),
// 	next_cycle: z
// 		.object({
// 			starts_at: z.number(),
// 			total: z.number(),
// 		})
// 		.nullish(),
// });

export type CheckoutParamsV0 = z.infer<typeof CheckoutParamsV0Schema>;
