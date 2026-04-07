import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";
import { phaseItemMatchesAutumnPrice } from "../matchUtils/phaseItemMatchesAutumnPrice";

export const findPhaseItemForAutumnPrice = ({
	price,
	product,
	phaseItems,
}: {
	price: Price;
	product: Product;
	phaseItems: Stripe.SubscriptionSchedule.Phase.Item[];
}): Stripe.SubscriptionSchedule.Phase.Item | undefined => {
	return phaseItems.find((phaseItem) =>
		phaseItemMatchesAutumnPrice({
			phaseItem,
			price,
			product,
		}),
	);
};
