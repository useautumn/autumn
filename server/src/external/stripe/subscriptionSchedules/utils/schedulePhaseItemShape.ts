import type Stripe from "stripe";

type PhaseItem =
	| Stripe.SubscriptionSchedule.Phase.Item
	| Stripe.SubscriptionScheduleUpdateParams.Phase.Item;

const itemPriceId = (item: PhaseItem) => {
	const { price } = item;
	if (!price) return "";
	return typeof price === "string" ? price : price.id;
};

/** A phase's items as a comparable string: price ids and quantities, order-independent. */
export const schedulePhaseItemShape = (phase: { items: PhaseItem[] }) =>
	JSON.stringify(
		phase.items
			.map((item) => ({
				price: itemPriceId(item),
				quantity: item.quantity ?? 1,
			}))
			.sort((left, right) => left.price.localeCompare(right.price)),
	);
