import { CusProductStatus, stripeRefToId } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeResourceMissing } from "@/external/stripe/common/utils/isStripeResourceMissing";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { stripeSubscriptionToAutumnStatus } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";

export type ReissueSubscription = {
	/** Set only while the subscription can still take invoices; Stripe refuses to link an ended one. */
	stripeSubId?: string;
	subscriptionEnded: boolean;
	/** The ended subscription's card, which a standalone replacement would otherwise lose. */
	endedPaymentMethodId?: string;
};

export const resolveReissueSubscription = async ({
	stripeCli,
	stripeInvoice,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
}): Promise<ReissueSubscription> => {
	const stripeSubId = stripeInvoiceToStripeSubscriptionId(stripeInvoice);
	if (!stripeSubId) return { subscriptionEnded: false };

	const subscription = await stripeCli.subscriptions
		.retrieve(stripeSubId)
		.catch((error) => {
			if (isStripeResourceMissing(error)) return null;
			throw error;
		});
	if (!subscription) return { subscriptionEnded: true };

	const subscriptionEnded =
		stripeSubscriptionToAutumnStatus({ stripeStatus: subscription.status }) ===
		CusProductStatus.Expired;
	if (!subscriptionEnded) return { stripeSubId, subscriptionEnded };

	return {
		subscriptionEnded,
		endedPaymentMethodId:
			stripeRefToId(subscription.default_payment_method) ?? undefined,
	};
};
