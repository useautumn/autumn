import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels.js";
import { z } from "zod/v4";
import { BillingPreviewResponseSchema } from "../../api/billing/common/billingPreviewResponse.js";
import { ApiBalanceSchema } from "../../api/customers/cusFeatures/apiBalance.js";
import { ApiSubscriptionSchema } from "../../api/customers/cusPlans/apiSubscription.js";
import { ApiPlanSchema } from "../../api/products/apiPlan.js";

/**
 * Org branding for checkout display
 */
export const CheckoutOrgSchema = z.object({
	name: z.string(),
	logo: z.string().nullable(),
});

/**
 * Customer info for checkout display
 */
export const CheckoutCustomerSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	email: z.string().nullable(),
});

/**
 * Entity info for checkout display (optional)
 */
export const CheckoutEntitySchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
});

/**
 * Subscription with required plan (always expanded for checkout)
 */
export const CheckoutSubscriptionSchema = ApiSubscriptionSchema.extend({
	plan: ApiPlanSchema,
});

/**
 * A change in the checkout (product being added, canceled, or expiring)
 */
export const CheckoutChangeSchema = z.object({
	plan: ApiPlanSchema,
	feature_quantities: z.array(
		FeatureOptionsSchema.pick({
			feature_id: true,
			quantity: true,
		}),
	),
	balances: z.record(z.string(), ApiBalanceSchema),
	period_start: z.number().optional(),
	period_end: z.number().optional(),
});

/**
 * GET /checkouts/:checkout_id response
 */
export const GetCheckoutResponseSchema = z.object({
	preview: BillingPreviewResponseSchema,
	org: CheckoutOrgSchema,
	customer: CheckoutCustomerSchema,
	entity: CheckoutEntitySchema.nullable(),
	incoming: z.array(CheckoutChangeSchema),
	outgoing: z.array(CheckoutChangeSchema),
});

/**
 * POST /checkouts/:checkout_id/confirm response
 */
export const ConfirmCheckoutResponseSchema = z.object({
	success: z.boolean(),
	checkout_id: z.string(),
	customer_id: z.string(),
	product_id: z.string(),
	invoice_id: z.string().nullable(),
});

export type CheckoutOrg = z.infer<typeof CheckoutOrgSchema>;
export type CheckoutCustomer = z.infer<typeof CheckoutCustomerSchema>;
export type CheckoutEntity = z.infer<typeof CheckoutEntitySchema>;
export type CheckoutSubscription = z.infer<typeof CheckoutSubscriptionSchema>;
export type CheckoutChange = z.infer<typeof CheckoutChangeSchema>;
export type GetCheckoutResponse = z.infer<typeof GetCheckoutResponseSchema>;
export type ConfirmCheckoutResponse = z.infer<
	typeof ConfirmCheckoutResponseSchema
>;
