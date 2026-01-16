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
		await SubService.updateFromStripe({
			db,
			stripeSub: stripeSubscription,
		});
	} catch (error) {
		logger.warn(
			`[customer.subscription.updated] Failed to update sub ${stripeSubscription.id} from stripe. ${error}`,
		);
	}
};
