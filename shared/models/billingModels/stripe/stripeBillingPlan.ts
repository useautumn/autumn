import { z } from "zod/v4";
import {
	type StripeCheckoutSessionAction,
	StripeCheckoutSessionActionSchema,
} from "./stripeCheckoutSessionAction";
import {
	type StripeInvoiceAction,
	StripeInvoiceActionSchema,
} from "./stripeInvoiceAction";
import {
	type StripeInvoiceItemsAction,
	StripeInvoiceItemsActionSchema,
} from "./stripeInvoiceItemsAction";
import {
	type StripeRefundAction,
	StripeRefundActionSchema,
} from "./stripeRefundAction";
import {
	type StripeSubscriptionAction,
	StripeSubscriptionActionSchema,
} from "./stripeSubscriptionAction";
import {
	type StripeSubscriptionScheduleAction,
	StripeSubscriptionScheduleActionSchema,
} from "./stripeSubscriptionScheduleAction";

export {
	type StripeCheckoutSessionAction,
	StripeCheckoutSessionActionSchema,
	type StripeInvoiceAction,
	StripeInvoiceActionSchema,
	type StripeInvoiceItemsAction,
	StripeInvoiceItemsActionSchema,
	type StripeRefundAction,
	StripeRefundActionSchema,
	type StripeSubscriptionAction,
	StripeSubscriptionActionSchema,
	type StripeSubscriptionScheduleAction,
	StripeSubscriptionScheduleActionSchema,
};

export const StripeBillingPlanSchema = z.object({
	subscriptionAction: StripeSubscriptionActionSchema.optional(),
	subscriptionScheduleAction: StripeSubscriptionScheduleActionSchema.optional(),
	invoiceAction: StripeInvoiceActionSchema.optional(),
	invoiceItemsAction: StripeInvoiceItemsActionSchema.optional(),
	checkoutSessionAction: StripeCheckoutSessionActionSchema.optional(),
	refundAction: StripeRefundActionSchema.optional(),
});

export type StripeBillingPlan = z.infer<typeof StripeBillingPlanSchema>;

export type StripeInvoiceMetadata = {
	autumn_metadata_id: string;
};
