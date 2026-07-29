import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { upsertSubscriptionFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertSubscriptionFromBilling.js";

/** sub.updated only patches existing rows, so a subscription missed here never
 *  gets period tracking — upsert for every known customer's new subscription. */
export const upsertSubscriptionRow = async ({
	ctx,
	subscription,
}: {
	ctx: StripeWebhookContext;
	subscription: Stripe.Subscription;
}) => {
	try {
		await upsertSubscriptionFromBilling({
			ctx,
			stripeSubscription: subscription,
		});
	} catch (err) {
		ctx.logger.error(
			`[sub.created] failed to upsert subscription row for ${subscription.id}`,
			err,
		);
	}
};
