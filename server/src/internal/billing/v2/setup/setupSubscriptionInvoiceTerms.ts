import type {
	InvoicePaymentMethod,
	SubscriptionInvoiceTerms,
} from "@autumn/shared";
import type Stripe from "stripe";

/** Leaving invoice_mode out keeps a send_invoice subscription invoiced on its own terms; an explicit invoice_mode wins. */
export const setupSubscriptionInvoiceTerms = ({
	params,
	stripeSubscription,
}: {
	params: { invoice_mode?: unknown };
	stripeSubscription?: Stripe.Subscription;
}): SubscriptionInvoiceTerms | undefined => {
	if (params.invoice_mode !== undefined) return undefined;
	if (stripeSubscription?.collection_method !== "send_invoice")
		return undefined;

	return {
		daysUntilDue: stripeSubscription.days_until_due ?? undefined,
		paymentMethodTypes: (stripeSubscription.payment_settings
			?.payment_method_types ?? undefined) as
			| InvoicePaymentMethod[]
			| undefined,
	};
};
