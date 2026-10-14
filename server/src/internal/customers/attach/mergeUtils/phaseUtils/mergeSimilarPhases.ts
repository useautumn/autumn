import type Stripe from "stripe";

const normalizePhaseItems = (
	items: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[],
) => {
	return items
		.map((item) => ({
			price: item.price as string,
			quantity: item.quantity || 0,
		}))
		.sort((a, b) => {
			if (a.price === b.price) return (a.quantity || 0) - (b.quantity || 0);
			return a.price.localeCompare(b.price);
		});
};

const haveSameItems = (
	a: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[],
	b: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[],
) => {
	if (a.length !== b.length) return false;
	const na = normalizePhaseItems(a);
	const nb = normalizePhaseItems(b);
	for (let i = 0; i < na.length; i++) {
		if (na[i].price !== nb[i].price) return false;
		if ((na[i].quantity || 0) !== (nb[i].quantity || 0)) return false;
	}
	return true;
};

const hasNoItems = (phase: Stripe.SubscriptionScheduleUpdateParams.Phase) => {
	const items =
		(phase.items as Stripe.SubscriptionScheduleUpdateParams.Phase.Item[]) || [];
	return items.length === 0;
};

const removeEmptyPhasesAndAdjustDates = (
	phases: Stripe.SubscriptionScheduleUpdateParams.Phase[],
): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
	if (!phases || phases.length <= 1) return phases;

	const result: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [];

	for (let i = 0; i < phases.length; i++) {
		const phase = phases[i];

		if (!hasNoItems(phase)) {
			const clonedPhase = structuredClone(phase);

			if (result.length > 0) {
				const prevPhase = result[result.length - 1];

				let hasEmptyPhasesBetween = false;
				for (let j = i - 1; j >= 0; j--) {
					const checkPhase = phases[j];
					if (!hasNoItems(checkPhase)) {
						break;
					}
					hasEmptyPhasesBetween = true;
				}

				if (hasEmptyPhasesBetween && clonedPhase.start_date) {
					prevPhase.end_date = clonedPhase.start_date;
				}
			}

			result.push(clonedPhase);
		}
	}

	return result;
};

export const mergeAdjacentPhasesWithSameItems = (
	phases: Stripe.SubscriptionScheduleUpdateParams.Phase[],
): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
	if (!phases || phases.length <= 1) return phases;

	const nonEmptyPhases = removeEmptyPhasesAndAdjustDates(phases);

	if (nonEmptyPhases.length <= 1) return nonEmptyPhases;

	const merged: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [];
	let current = structuredClone(nonEmptyPhases[0]);

	for (let i = 1; i < nonEmptyPhases.length; i++) {
		const next = nonEmptyPhases[i];
		const same = haveSameItems(
			(current.items as Stripe.SubscriptionScheduleUpdateParams.Phase.Item[]) ||
				[],
			(next.items as Stripe.SubscriptionScheduleUpdateParams.Phase.Item[]) ||
				[],
		);

		if (same) {
			const curStart = current.start_date as number | undefined;
			const nextStart = next.start_date as number | undefined;
			if (
				typeof curStart === "number" &&
				typeof nextStart === "number" &&
				nextStart < curStart
			) {
				current.start_date = nextStart;
			}

			const curEnd = current.end_date as number | undefined;
			const nextEnd = next.end_date as number | undefined;
			if (
				typeof curEnd === "number" &&
				typeof nextEnd === "number" &&
				nextEnd > curEnd
			) {
				current.end_date = nextEnd;
			} else if (typeof curEnd !== "number") {
				current.end_date = next.end_date;
			}
		} else {
			merged.push(current);
			current = structuredClone(next);
		}
	}

	merged.push(current);
	return merged;
};
