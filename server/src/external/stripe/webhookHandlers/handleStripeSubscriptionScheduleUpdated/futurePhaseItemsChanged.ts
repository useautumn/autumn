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

/** True when a phase that has not started yet changed price or quantity.
 * Phases pair by start date, so a reordered index is not an edit. */
export const futurePhaseItemsChanged = ({
	previousPhases,
	currentPhases,
	nowSeconds,
}: {
	previousPhases: Stripe.SubscriptionSchedule.Phase[];
	currentPhases: Stripe.SubscriptionSchedule.Phase[];
	nowSeconds: number;
}): boolean =>
	currentPhases.some((phase) => {
		if (phase.start_date <= nowSeconds) return false;
		const previous = previousPhases.find(
			(candidate) => candidate.start_date === phase.start_date,
		);
		return !previous || itemShape(previous) !== itemShape(phase);
	});
