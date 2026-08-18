import type { Subscription } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initSubscriptionFromStripe } from "@/internal/subscriptions/utils/initSubscriptionFromStripe";
import type { FlashPlanContext } from "../../setup/setupFlashContext";

/**
 * Mirror each hydrated Stripe subscription into an Autumn subscription row, so
 * an imported plan reports its real billing period instead of null.
 */
export const collectFlashSubscriptions = ({
	ctx,
	planContexts,
}: {
	ctx: AutumnContext;
	planContexts: FlashPlanContext[];
}): Subscription[] => {
	const subscriptionByStripeId = new Map<string, Subscription>();

	for (const planContext of planContexts) {
		const stripeSubscription = planContext.stripeHydration?.stripeSubscription;
		if (!stripeSubscription) continue;
		if (subscriptionByStripeId.has(stripeSubscription.id)) continue;

		subscriptionByStripeId.set(
			stripeSubscription.id,
			initSubscriptionFromStripe({ ctx, stripeSubscription }),
		);
	}

	return Array.from(subscriptionByStripeId.values());
};
