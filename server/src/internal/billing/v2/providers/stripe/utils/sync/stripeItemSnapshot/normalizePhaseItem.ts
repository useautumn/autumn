import type Stripe from "stripe";
import { stripePriceToSnapshotFields } from "./stripePriceToSnapshotFields";
import type { StripeItemSnapshot } from "./types";

export const normalizePhaseItem = ({
	phaseItem,
	syntheticId,
	currency,
}: {
	phaseItem: Stripe.SubscriptionSchedule.Phase.Item;
	syntheticId: string;
	currency: string;
}): StripeItemSnapshot | null => {
	const rawPrice = phaseItem.price as string | Stripe.Price | undefined;
	if (!rawPrice) return null;

	if (typeof rawPrice === "string" || rawPrice.deleted) return null;

	return {
		id: syntheticId,
		...stripePriceToSnapshotFields({ price: rawPrice, currency }),
		quantity: phaseItem.quantity ?? 1,
		metadata: phaseItem.metadata ?? {},
	};
};
