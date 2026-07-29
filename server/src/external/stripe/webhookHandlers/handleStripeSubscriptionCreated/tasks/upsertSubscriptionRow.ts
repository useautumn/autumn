import type Stripe from "stripe";
import { isTransientDbError } from "@/db/dbUtils.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { upsertSubscriptionFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertSubscriptionFromBilling.js";

/** Runs last: sub.updated only patches existing rows, so a lost row must fail
 *  the handler and ride webhook replay/redelivery — but only when retry helps. */
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
		// Deterministic failures would loop the replay without ever succeeding.
		if (isTransientDbError({ error })) throw error;
		ctx.logger.error(
			`[sub.created] failed to upsert subscription row for ${subscription.id}`,
			{ error },
		);
	}
};
