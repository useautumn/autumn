import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { billingActions } from "@/internal/billing/v2/actions";
import { canAutoSync } from "@/internal/billing/v2/actions/sync/canAutoSync/index.js";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams.js";
import { isAutumnCheckoutSubscription } from "@/internal/billing/v2/actions/sync/utils/isAutumnCheckoutSubscription.js";
import { shouldSkipSubscriptionSync } from "../../common/subscriptionSync/shouldSkipSubscriptionSync.js";
import type { StripeSubscriptionCreatedContext } from "../setupStripeSubscriptionCreatedContext.js";

/**
 * Custom base prices can auto-sync; custom feature prices and unresolved items
 * still abort via canAutoSync.
 */
export const autoSyncFromSubscription = async ({
	ctx,
	subscriptionCreatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionCreatedContext: StripeSubscriptionCreatedContext;
}) => {
	const { logger, stripeCli } = ctx;
	const { subscription, fullCustomer } = subscriptionCreatedContext;
	const customerId = fullCustomer.id ?? fullCustomer.internal_id;

	const skip = shouldSkipSubscriptionSync({
		subscription,
		fullCustomer,
		requireRecent: false,
	});
	if (skip.skip) {
		logger.info(
			`sub.created auto-sync skipping ${subscription.id} (${skip.reason})`,
		);
		return;
	}

	if (await isAutumnCheckoutSubscription({ stripeCli, subscription })) {
		logger.info(
			`sub.created auto-sync skipping ${subscription.id}: originated from Autumn checkout session`,
		);
		return;
	}

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
		customerProducts: fullCustomer.customer_products,
	});

	const eligibility = canAutoSync({ match });
	if (!eligibility.eligible) {
		logger.info(
			`sub.created auto-sync skipping ${subscription.id}: ${eligibility.reason} — ${eligibility.details}`,
		);
		return;
	}

	await billingActions.syncV2({ ctx, params });
};
