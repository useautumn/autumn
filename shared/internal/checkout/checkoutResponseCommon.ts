import { z } from "zod/v4";
import { AttachPreviewResponseSchema } from "../../api/billing/common/attachPreviewResponse";
import { BillingPreviewResponseSchema } from "../../api/billing/common/billingPreviewResponse";
import { BillingResponseSchema } from "../../api/billing/common/billingResponse";
import { PreviewUpdateSubscriptionResponseSchema } from "../../api/billing/updateSubscription/previewUpdateSubscriptionResponse";
import {
	CheckoutAction,
	CheckoutStatus,
} from "../../models/checkouts/checkoutTable";

export const CheckoutOrgSchema = z.object({
	name: z.string(),
	logo: z.string().nullable(),
});

export const CheckoutCustomerSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	email: z.string().nullable(),
});

export const CheckoutEntitySchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
});

export const CheckoutPreviewSchema = z.union([
	AttachPreviewResponseSchema,
	BillingPreviewResponseSchema,
	PreviewUpdateSubscriptionResponseSchema,
]);

export const CheckoutResponseBaseSchema = z.object({
	env: z.string(),
	action: z.nativeEnum(CheckoutAction),
	status: z.nativeEnum(CheckoutStatus),
	response: BillingResponseSchema.nullable(),
	preview: CheckoutPreviewSchema,
	org: CheckoutOrgSchema,
	customer: CheckoutCustomerSchema,
	entity: CheckoutEntitySchema.nullable(),
	adjustable_feature_ids: z.array(z.string()),
});

export type CheckoutOrg = z.infer<typeof CheckoutOrgSchema>;
export type CheckoutCustomer = z.infer<typeof CheckoutCustomerSchema>;
export type CheckoutEntity = z.infer<typeof CheckoutEntitySchema>;
