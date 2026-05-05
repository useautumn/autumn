import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { billingActions } from "@/internal/billing/v2/actions";
import { canAutoSync } from "@/internal/billing/v2/actions/sync/canAutoSync.js";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams.js";
import type { StripeSubscriptionCreatedContext } from "../setupStripeSubscriptionCreatedContext.js";

/**
 * On Stripe subscription create, run detection on the new subscription and
 * (when safe) execute a syncV2 to materialize the matching Autumn customer
 * products.
 *
 * Eligibility is gated by `canAutoSync` — conservative defaults: any
 * unmatched Stripe item, custom feature price, plan warning, or
 * unresolvable base price aborts auto-sync. Custom BASE prices are
 * accepted (handled via `customize.price`).
 */
export const autoSyncFromSubscription = async ({
	ctx,
	subscriptionCreatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionCreatedContext: StripeSubscriptionCreatedContext;
}) => {
	const { logger } = ctx;
	const { subscription, fullCustomer } = subscriptionCreatedContext;
	const customerId = fullCustomer.id ?? fullCustomer.internal_id;

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
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
