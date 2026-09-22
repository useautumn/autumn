import type Stripe from "stripe";

/** Everything a phase can carry except the quantity a phase step changes.
 * Comparing the whole shape means a field Stripe adds later reads as a
 * difference until it is deliberately allowed, rather than being ignored. */
const billingShapeOf = (phase: Stripe.SubscriptionSchedule.Phase) => {
	const { start_date, end_date, items, ...rest } = phase;

	return JSON.stringify({
		...rest,
		items: items
			.map((item) => {
				const { quantity, price, ...itemRest } = item;
				const priceId = typeof price === "string" ? price : price?.id;
				return { ...itemRest, priceId };
			})
			.sort((left, right) =>
				String(left.priceId).localeCompare(String(right.priceId)),
			),
	});
};

/** A schedule whose future phases differ from the one running now only by
 * quantity is a step the subscription webhook applies, so Autumn holds no
 * phase for it and verify has nothing to compare against. */
export const isQuantityOnlySchedule = ({
	schedule,
}: {
	schedule: Stripe.SubscriptionSchedule;
}) => {
	const currentStart = schedule.current_phase?.start_date;
	if (currentStart === undefined) return false;

	const currentPhase = schedule.phases.find(
		(phase) => phase.start_date === currentStart,
	);
	if (!currentPhase) return false;

	const futurePhases = schedule.phases.filter(
		(phase) => phase.start_date > currentStart,
	);
	if (futurePhases.length === 0) return false;

	const currentShape = billingShapeOf(currentPhase);
	return futurePhases.every((phase) => billingShapeOf(phase) === currentShape);
};
