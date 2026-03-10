import { z } from "zod/v4";
import { AttachPreviewResponseSchema } from "../../api/billing/common/attachPreviewResponse";
import { BillingResponseSchema } from "../../api/billing/common/billingResponse";
import { PreviewUpdateSubscriptionResponseSchema } from "../../api/billing/updateSubscription/previewUpdateSubscriptionResponse";
import {
	CheckoutAction,
	CheckoutStatus,
} from "../../models/checkouts/checkoutTable";

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
 * GET /checkouts/:checkout_id response
 */
export const GetCheckoutResponseSchema = z.object({
	env: z.string(),
	action: z.nativeEnum(CheckoutAction),
	status: z.nativeEnum(CheckoutStatus),
	response: BillingResponseSchema.nullable(),
	preview: z.union([
		AttachPreviewResponseSchema,
		PreviewUpdateSubscriptionResponseSchema,
	]),
	org: CheckoutOrgSchema,
	customer: CheckoutCustomerSchema,
	entity: CheckoutEntitySchema.nullable(),
});

/**
 * POST /checkouts/:checkout_id/confirm response
 */
export const ConfirmCheckoutResponseSchema = BillingResponseSchema.extend({
	success: z.boolean(),
	checkout_id: z.string(),
	product_id: z.string(),
	invoice_id: z.string().nullable(),
	success_url: z.string().url(),
});

export type CheckoutOrg = z.infer<typeof CheckoutOrgSchema>;
export type CheckoutCustomer = z.infer<typeof CheckoutCustomerSchema>;
export type CheckoutEntity = z.infer<typeof CheckoutEntitySchema>;
export type GetCheckoutResponse = z.infer<typeof GetCheckoutResponseSchema>;
export type ConfirmCheckoutResponse = z.infer<
	typeof ConfirmCheckoutResponseSchema
>;
