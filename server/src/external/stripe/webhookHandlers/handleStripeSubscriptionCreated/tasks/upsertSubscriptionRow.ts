import type Stripe from "stripe";
import { isTransientDbError } from "@/db/dbUtils.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { upsertSubscriptionFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertSubscriptionFromBilling.js";

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
	} catch (error) {
		if (isTransientDbError({ error })) throw error;
		ctx.logger.error(
			`[sub.created] failed to upsert subscription row for ${subscription.id}`,
			{ error },
		);
	}
};
