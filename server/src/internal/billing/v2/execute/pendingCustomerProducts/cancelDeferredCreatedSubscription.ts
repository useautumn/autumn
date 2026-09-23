import {
	type DeferredAutumnBillingPlanData,
	type Metadata,
	MetadataType,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { Logger } from "@/external/logtail/logtailUtils";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";

/** Only a sub created for the pending plan is canceled; an updated sub still carries active plans. */
const deferredMetadataToCreatedStripeSubscriptionId = ({
	metadata,
	stripeInvoice,
}: {
	metadata: Metadata;
	stripeInvoice: Stripe.Invoice;
}) => {
	if (metadata.type !== MetadataType.DeferredInvoice) return undefined;

	const data = metadata.data as DeferredAutumnBillingPlanData | undefined;
	const createdSubscription =
		data?.billingPlan?.stripe?.subscriptionAction?.type === "create";
	if (!createdSubscription) return undefined;

	return stripeInvoiceToStripeSubscriptionId(stripeInvoice);
};

export const cancelDeferredCreatedSubscription = async ({
	ctx,
	stripeCli,
	metadata,
	stripeInvoice,
}: {
	ctx: { logger: Logger };
	stripeCli: Stripe;
	metadata: Metadata;
	stripeInvoice: Stripe.Invoice;
}) => {
	const stripeSubscriptionId = deferredMetadataToCreatedStripeSubscriptionId({
		metadata,
		stripeInvoice,
	});
	if (!stripeSubscriptionId) return;

	try {
		await stripeCli.subscriptions.cancel(stripeSubscriptionId);
		ctx.logger.info(
			`[cancelDeferredCreatedSubscription] Canceled sub ${stripeSubscriptionId} for unpaid invoice ${stripeInvoice.id}`,
		);
	} catch (error) {
		ctx.logger.warn(
			`[cancelDeferredCreatedSubscription] Failed to cancel sub ${stripeSubscriptionId}: ${error}`,
		);
	}
};
