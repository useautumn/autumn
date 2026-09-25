import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { SubService } from "@/internal/subscriptions/SubService";

export const syncAutumnSubscription = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}) => {
	const { db, logger } = ctx;
	const { stripeSubscription } = subscriptionUpdatedContext;

	try {
		const subscription = await SubService.getByStripeId({
			db,
			stripeId: stripeSubscription.id,
		});
		const { start, end } = subToPeriodStartEnd({ sub: stripeSubscription });
		const unchanged =
			subscription?.current_period_start === start &&
			subscription?.current_period_end === end &&
			subscription?.billing_cycle_anchor_seconds ===
				stripeSubscription.billing_cycle_anchor;
		if (unchanged) return;

		subscriptionUpdatedContext.results.subscription =
			await SubService.updateFromStripe({
				db,
				stripeSub: stripeSubscription,
			});
	} catch (error) {
		subscriptionUpdatedContext.results.errors.push(error);
		logger.warn(
			`[customer.subscription.updated] Failed to update sub ${stripeSubscription.id} from stripe. ${error}`,
		);
	}
};
