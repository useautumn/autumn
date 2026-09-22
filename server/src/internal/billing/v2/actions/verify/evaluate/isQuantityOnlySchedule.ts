import type Stripe from "stripe";

const priceIdOf = (
	item: Stripe.SubscriptionSchedule.Phase.Item,
): string | undefined => {
	if (typeof item.price === "string") return item.price;
	return item.price?.id;
};

/** Stripe's own quantity is what a phase changes; anything else is a real edit. */
const priceIdsOf = (phase: Stripe.SubscriptionSchedule.Phase) =>
	phase.items
		.map(priceIdOf)
		.filter((priceId): priceId is string => Boolean(priceId))
		.sort();

const samePrices = ({
	phase,
	against,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
	against: Stripe.SubscriptionSchedule.Phase;
}) => {
	const left = priceIdsOf(phase);
	const right = priceIdsOf(against);
	return (
		left.length === right.length &&
		left.every((priceId, index) => priceId === right[index])
	);
};

/** A schedule whose future phases carry the same prices as the one running now
 * only steps a quantity, which the subscription webhook applies — so Autumn
 * holds no phase for it and verify has nothing to compare against. */
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

	return futurePhases.every((phase) =>
		samePrices({ phase, against: currentPhase }),
	);
};
