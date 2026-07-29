import type Stripe from "stripe";
import { stripePriceToSnapshotFields } from "./stripePriceToSnapshotFields";
import type { StripeItemSnapshot } from "./types";

export const normalizeSubscriptionItem = ({
	stripeItem,
	currency,
}: {
	stripeItem: Stripe.SubscriptionItem;
	currency: string;
}): StripeItemSnapshot | null => {
	return {
		id: stripeItem.id,
		...stripePriceToSnapshotFields({ price: stripeItem.price, currency }),
		quantity: stripeItem.quantity ?? 1,
		metadata: stripeItem.metadata ?? {},
	};
};
