import { isCustomerProductOnStripeSubscription } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { isStripeSubscriptionPastDueTransition } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { stripeSubscriptionToLatestInvoice } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";

export const handleCancelOnPastDue = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { org, env, logger } = ctx;
	const { stripeSubscription, previousAttributes, customerProducts } =
		subscriptionUpdatedContext;

	if (!org.config.cancel_on_past_due) return;

	if (
		!isStripeSubscriptionPastDueTransition({
			stripeSubscription,
			previousAttributes,
		})
	)
		return;

	const ignorePastDue = customerProducts.some(
		(customerProduct) =>
			isCustomerProductOnStripeSubscription({
				customerProduct,
				stripeSubscriptionId: stripeSubscription.id,
			}) && customerProduct.product.config?.ignore_past_due,
	);
	if (ignorePastDue) {
		logger.info(
			`subscription.updated (past_due): skipping cancel for ${stripeSubscription.id}, ignore_past_due is set`,
		);
		return;
	}

	const stripeCli = createStripeCli({ org, env });

	const latestInvoice = await stripeSubscriptionToLatestInvoice({
		stripeSubscription,
		stripeCli,
	});

	if (!latestInvoice) {
		logger.warn("[handleCancelOnPastDue] No latest invoice found");
		return;
	}

	logger.info(`Latest invoice billing reason: ${latestInvoice.billing_reason}`);

	const validBillingReasons = ["subscription_cycle", "subscription_create"];
	if (!validBillingReasons.includes(latestInvoice.billing_reason ?? "")) {
		logger.info(
			`subscription.updated, latest invoice billing reason isn't subscription_cycle / subscription_create, past_due not forcing cancel`,
		);
		return;
	}

	try {
		logger.info(
			`subscription.updated (past_due), cancelling subscription: ${stripeSubscription.id}`,
		);

		subscriptionUpdatedContext.results.stripeSubscription =
			await stripeCli.subscriptions.cancel(stripeSubscription.id);

		if (latestInvoice.status === "open") {
			await stripeCli.invoices.voidInvoice(latestInvoice.id);
		}
	} catch (error: unknown) {
		subscriptionUpdatedContext.results.errors.push(error);
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(
			`subscription.updated: error cancelling / voiding: ${errorMessage}`,
		);
	}
};
