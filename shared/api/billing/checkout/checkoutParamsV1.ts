import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData.js";
import { EntityDataSchema } from "../../common/entityData.js";
import { FeatureQuantitySchema } from "../common/featureQuantities.js";
import { PlanOverrideSchema } from "../common/planOverride.js";

// product_ids: z
//   .array(z.string())
//   .min(1)
//   .nullish()
//   .describe(
//     "Can be used to attach multiple products to the customer at once. For example, attaching a main product and an add-on.",
//   ),

// Overrides:
// // free_trial: z
//   .boolean()
//   .optional()
//   .describe(
//     "If the product has a free trial, this field can be used to disable it when attaching (by passing in false)",
//   ),

// force_checkout: z
//   .boolean()
//   .optional()
//   .describe(
//     "Always return a Stripe Checkout URL, even if the customer's card is already on file",
//   ),

// products: z.array(ProductOptions).nullish(), [got rid of products lol]
// customer_data: CustomerDataSchema.nullish(), // For safety

/* 
Notes: 
- free_trial: false -> plan_override.free_trial: false
- New behaviour for checkout -> Always force checkout (?)

// Custom Product
	// is_custom: z.boolean().optional(),
	// items: z.array(ProductItemSchema).optional(),


  	// setup_payment: z.boolean().optional(),
*/

export const ExtCheckoutParamsV1Schema = z
	.object({
		// Customer / Entity Info
		customer_id: z.string(),
		plan_id: z.string(),
		version: z.number().optional(),

		entity_id: z.string().optional(),
		customer_data: CustomerDataSchema.optional(),
		entity_data: EntityDataSchema.optional(),
		feature_quantities: z.array(FeatureQuantitySchema).optional(),

		success_url: z.string().optional(),
		checkout_session_params: z.record(z.string(), z.any()).optional(),

		reward: z.string().or(z.array(z.string())).optional(),

		invoice: z.boolean().optional(),
		invoice_settings: z.object({
			enable_immediately: z.boolean(),
			finalize_immediately: z.boolean(),
		}),

		plan_override: PlanOverrideSchema.optional(),
	})
	.meta({
		description:
			"Returns a Stripe Checkout URL for the customer to make a payment, or returns payment confirmation information.",
	});

export const CheckoutParamsV1Schema = ExtCheckoutParamsV1Schema.extend({
	setup_payment: z.boolean().optional(),
});

export type CheckoutParamsV1 = z.infer<typeof CheckoutParamsV1Schema>;

// // Override free_trial to support CreateFreeTrialSchema
// free_trial: CreateFreeTrialSchema.or(z.boolean()).optional(),

// // New Version
// version: z.number().optional(),

// // Others
// metadata: z.any().optional(),
// billing_cycle_anchor: z.number().optional(),
// enable_product_immediately: z.boolean().optional(),
// finalize_invoice: z.boolean().optional(),
