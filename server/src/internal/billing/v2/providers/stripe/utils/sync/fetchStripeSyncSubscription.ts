import type Stripe from "stripe";
import { STRIPE_SYNC_SUBSCRIPTION_EXPAND } from "./stripeItemSnapshot/stripeSyncExpand";

export const fetchStripeSyncSubscription = async ({
	stripeCli,
	subscriptionId,
}: {
	stripeCli: Stripe;
	subscriptionId?: string;
}) =>
	subscriptionId
		? stripeCli.subscriptions.retrieve(subscriptionId, {
				expand: STRIPE_SYNC_SUBSCRIPTION_EXPAND,
			})
		: null;
