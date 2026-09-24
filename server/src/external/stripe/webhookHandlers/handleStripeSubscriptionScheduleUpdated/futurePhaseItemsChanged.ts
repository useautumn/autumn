import type Stripe from "stripe";

const itemShape = (phase: Stripe.SubscriptionSchedule.Phase) =>
	JSON.stringify(
		phase.items
			.map((item) => ({
				price: typeof item.price === "string" ? item.price : item.price.id,
				quantity: item.quantity ?? 1,
			}))
			.sort((left, right) => left.price.localeCompare(right.price)),
	);

/** True when a phase that has not started yet changed price or quantity. */
export const futurePhaseItemsChanged = ({
	previousPhases,
	currentPhases,
	nowSeconds,
}: {
	previousPhases: Stripe.SubscriptionSchedule.Phase[];
	currentPhases: Stripe.SubscriptionSchedule.Phase[];
	nowSeconds: number;
}): boolean =>
	currentPhases.some((phase, index) => {
		if (phase.start_date <= nowSeconds) return false;
		const previous = previousPhases[index];
		return !previous || itemShape(previous) !== itemShape(phase);
	});
