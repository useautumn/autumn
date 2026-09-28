import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext";
import type { StripeScheduleReleasedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionScheduleReleased/stripeScheduleReleasedContext";
import type { StripeScheduleUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionScheduleUpdated/setupScheduleUpdatedContext";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";

export type StripeWebhookHandlerResult =
	| {
			type: "invoice.created";
			context: InvoiceCreatedContext;
	  }
	| {
			type: "customer.subscription.updated";
			context: StripeSubscriptionUpdatedContext;
	  }
	| {
			type: "invoice.paid";
			context: StripeInvoicePaidContext;
	  }
	| {
			type: "subscription_schedule.updated";
			context: StripeScheduleUpdatedContext;
	  }
	| {
			type: "subscription_schedule.released";
			context: StripeScheduleReleasedContext;
	  };
