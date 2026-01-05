import { z } from "zod/v4";
import {
	StripeInvoiceActionSchema,
	type StripeInvoiceAction,
} from "./stripeInvoiceAction";
import {
	StripeSubscriptionActionSchema,
	type StripeSubscriptionAction,
} from "./stripeSubscriptionAction";
import {
	StripeSubscriptionScheduleActionSchema,
	type StripeSubscriptionScheduleAction,
} from "./stripeSubscriptionScheduleAction";

export {
	StripeInvoiceActionSchema,
	StripeSubscriptionActionSchema,
	StripeSubscriptionScheduleActionSchema,
	type StripeInvoiceAction,
	type StripeSubscriptionAction,
	type StripeSubscriptionScheduleAction,
};

export const StripeBillingPlanSchema = z.object({
	subscriptionAction: StripeSubscriptionActionSchema.optional(),
	subscriptionScheduleAction: StripeSubscriptionScheduleActionSchema.optional(),
	invoiceAction: StripeInvoiceActionSchema.optional(),
});

export type StripeBillingPlan = z.infer<typeof StripeBillingPlanSchema>;

export type StripeInvoiceMetadata = {
	autumn_metadata_id: string;
};

