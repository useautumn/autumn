// import { ApiProductItemSchema } from "@api/products/planFeature/previousVersions/apiProductItem.js";
// import { ApiProductSchema } from "@api/products/previousVersions/apiProduct.js";
// import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels.js";
// import { z } from "zod/v4";
// import { AttachBodySchema, ExtAttachBodySchema } from "./attachModels.js";

// export const ExtCheckoutParamsSchema = ExtAttachBodySchema.extend({
// 	setup_payment: z.boolean().optional(),
// }).meta({
// 	description:
// 		"Returns a Stripe Checkout URL for the customer to make a payment, or returns payment confirmation information.",
// });

// export const CheckoutParamsSchema = AttachBodySchema.extend({
// 	// skip_checkout: z.boolean().optional(),
// 	setup_payment: z.boolean().optional(),
// });

// // RESULT
// export const CheckoutLineSchema = z.object({
// 	description: z.string(),
// 	amount: z.number(),
// 	item: ApiProductItemSchema.nullish(),
// });

// export const CheckoutResponseSchema = z.object({
// 	url: z.string().nullish(),
// 	customer_id: z.string(),
// 	lines: z.array(CheckoutLineSchema),
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

// export type CheckoutLine = z.infer<typeof CheckoutLineSchema>;
// export type CheckoutParams = z.infer<typeof CheckoutParamsSchema>;
