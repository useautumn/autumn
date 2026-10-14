import { CusProductStatus } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeResourceMissing } from "@/external/stripe/common/utils/isStripeResourceMissing";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { stripeSubscriptionToAutumnStatus } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";

/** The original's subscription while it can still take invoices; Stripe refuses to link one that has ended. */
export const resolveReissueSubscriptionId = async ({
	stripeCli,
	stripeInvoice,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
}): Promise<{ stripeSubId?: string; subscriptionEnded: boolean }> => {
	const stripeSubId = stripeInvoiceToStripeSubscriptionId(stripeInvoice);
	if (!stripeSubId) return { subscriptionEnded: false };

	const subscription = await stripeCli.subscriptions
		.retrieve(stripeSubId)
		.catch((error) => {
			if (isStripeResourceMissing(error)) return null;
			throw error;
		});
	const subscriptionEnded =
		!subscription ||
		stripeSubscriptionToAutumnStatus({ stripeStatus: subscription.status }) ===
			CusProductStatus.Expired;
	return subscriptionEnded
		? { subscriptionEnded }
		: { stripeSubId, subscriptionEnded };
};
