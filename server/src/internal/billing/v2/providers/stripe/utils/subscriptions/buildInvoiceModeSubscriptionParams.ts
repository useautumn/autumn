import type { InvoiceMode, StripeSubscriptionAction } from "@autumn/shared";
import type Stripe from "stripe";

type InvoiceModeSubscriptionParams = Pick<
	Stripe.SubscriptionCreateParams,
	"collection_method" | "days_until_due" | "payment_settings"
>;

export const buildInvoiceModeSubscriptionParams = ({
	invoiceMode,
	subscriptionAction,
}: {
	invoiceMode?: InvoiceMode;
	subscriptionAction: StripeSubscriptionAction;
}): InvoiceModeSubscriptionParams => {
	if (!invoiceMode) return {};

	const params: InvoiceModeSubscriptionParams = {
		collection_method: "send_invoice",
		days_until_due: invoiceMode.daysUntilDue ?? 30,
	};

	const actionPaymentSettings =
		subscriptionAction.type === "create" || subscriptionAction.type === "update"
			? subscriptionAction.params.payment_settings
			: undefined;

	if (invoiceMode.paymentMethodTypes?.length) {
		// Spread first so the custom-PM save_default_payment_method survives.
		params.payment_settings = {
			...actionPaymentSettings,
			payment_method_types: invoiceMode.paymentMethodTypes,
		};
	}

	return params;
};
