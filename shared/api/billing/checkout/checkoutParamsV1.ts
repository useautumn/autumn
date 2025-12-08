import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData.js";
import { EntityDataSchema } from "../../common/entityData.js";
import { FeatureQuantitySchema } from "../common/featureQuantities.js";
import { PlanOverrideSchema } from "../common/planOverride.js";

export const ExtCheckoutParamsV1Schema = z
	.object({
		// Customer / Entity Info
		customer_id: z.string(),
		plan_id: z.string().optional(),
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
