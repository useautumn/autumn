import {
	type DeferredAutumnBillingPlanData,
	type Metadata,
	MetadataType,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

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

/** Throws on Stripe failure so the caller keeps the metadata and the cron retries. */
export const cancelCreatedStripeSubscription = async ({
	ctx,
	stripeCli,
	metadata,
	stripeInvoice,
}: {
	ctx: RepoContext;
	stripeCli: Stripe;
	metadata: Metadata;
	stripeInvoice: Stripe.Invoice;
}) => {
	const stripeSubscriptionId = deferredMetadataToCreatedStripeSubscriptionId({
		metadata,
		stripeInvoice,
	});
	if (!stripeSubscriptionId) return;

	const stripeSubscription =
		await stripeCli.subscriptions.retrieve(stripeSubscriptionId);
	const isAlreadyEnded =
		isStripeSubscriptionCanceled(stripeSubscription) ||
		stripeSubscription.status === "incomplete_expired";
	if (isAlreadyEnded) return;

	await stripeCli.subscriptions.cancel(stripeSubscriptionId);
	ctx.logger.info(
		`[cancelCreatedStripeSubscription] Canceled sub ${stripeSubscriptionId} for unpaid invoice ${stripeInvoice.id}`,
	);
};
