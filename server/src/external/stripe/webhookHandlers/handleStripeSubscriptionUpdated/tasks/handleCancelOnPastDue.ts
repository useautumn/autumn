import { createStripeCli } from "@/external/connect/createStripeCli";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { stripeSubscriptionToLatestInvoice } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type {
	StripeSubscriptionUpdatedContext,
	SubscriptionPreviousAttributes,
} from "../stripeSubscriptionUpdatedContext";

/**
 * Detects if a subscription.updated event represents a transition to past_due.
 */
const isStripeSubscriptionPastDueEvent = ({
	stripeSubscription,
	previousAttributes,
}: {
	stripeSubscription: ExpandedStripeSubscription;
	previousAttributes: SubscriptionPreviousAttributes;
}): boolean => {
	const wasPastDue = previousAttributes.status === "past_due";
	const isPastDue = stripeSubscription.status === "past_due";
	return !wasPastDue && isPastDue;
};

/**
 * Handles the cancel_on_past_due org setting.
 * When enabled and subscription goes past_due, cancels the subscription immediately.
 */
export const handleCancelOnPastDue = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { org, env, logger } = ctx;
	const { stripeSubscription, previousAttributes } = subscriptionUpdatedContext;

	// Only proceed if org has cancel_on_past_due enabled
	if (!org.config.cancel_on_past_due) return;

	// Only proceed if subscription just transitioned to past_due
	const isPastDueEvent = isStripeSubscriptionPastDueEvent({
		stripeSubscription,
		previousAttributes,
	});
	if (!isPastDueEvent) return;

	const stripeCli = createStripeCli({ org, env });

	// Get latest invoice
	const latestInvoice = await stripeSubscriptionToLatestInvoice({
		stripeSubscription,
		stripeCli,
	});

	if (!latestInvoice) {
		logger.warn("[handleCancelOnPastDue] No latest invoice found");
		return;
	}

	logger.info(`Latest invoice billing reason: ${latestInvoice.billing_reason}`);

	// Only cancel for subscription_cycle or subscription_create invoices
	const validBillingReasons = ["subscription_cycle", "subscription_create"];
	if (!validBillingReasons.includes(latestInvoice.billing_reason ?? "")) {
		logger.info(
			`subscription.updated, latest invoice billing reason isn't subscription_cycle / subscription_create, past_due not forcing cancel`,
		);
		return;
	}

	// Cancel subscription and void invoice
	try {
		logger.info(
			`subscription.updated (past_due), cancelling subscription: ${stripeSubscription.id}`,
		);

		await stripeCli.subscriptions.cancel(stripeSubscription.id);

		if (latestInvoice.status === "open") {
			await stripeCli.invoices.voidInvoice(latestInvoice.id);
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(
			`subscription.updated: error cancelling / voiding: ${errorMessage}`,
		);
	}
};
