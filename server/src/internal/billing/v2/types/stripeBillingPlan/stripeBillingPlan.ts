import { z } from "zod/v4";
import {
	type StripeInvoiceAction,
	StripeInvoiceActionSchema,
} from "./stripeInvoiceAction";
import {
	type StripeInvoiceItemsAction,
	StripeInvoiceItemsActionSchema,
} from "./stripeInvoiceItemsAction";
import {
	type StripeSubscriptionAction,
	StripeSubscriptionActionSchema,
} from "./stripeSubscriptionAction";
import {
	type StripeSubscriptionScheduleAction,
	StripeSubscriptionScheduleActionSchema,
} from "./stripeSubscriptionScheduleAction";

export {
	StripeInvoiceActionSchema,
	StripeInvoiceItemsActionSchema,
	StripeSubscriptionActionSchema,
	StripeSubscriptionScheduleActionSchema,
	type StripeInvoiceAction,
	type StripeInvoiceItemsAction,
	type StripeSubscriptionAction,
	type StripeSubscriptionScheduleAction,
};

export const StripeBillingPlanSchema = z.object({
	subscriptionAction: StripeSubscriptionActionSchema.optional(),
	subscriptionScheduleAction: StripeSubscriptionScheduleActionSchema.optional(),
	invoiceAction: StripeInvoiceActionSchema.optional(),
	invoiceItemsAction: StripeInvoiceItemsActionSchema.optional(),
});

export type StripeBillingPlan = z.infer<typeof StripeBillingPlanSchema>;

export type StripeInvoiceMetadata = {
	autumn_metadata_id: string;
};
