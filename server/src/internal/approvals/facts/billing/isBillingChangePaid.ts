import type { FreeTrialFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

export type PaidPlanSignals = {
	trial: FreeTrialFacts | null;
	raisesRecurringPrice: boolean;
	addsPayPerUsePrice: boolean;
};

/**
 * A trial that can't turn into a charge on its own: one that reverts, or a card-less
 * one with no card on file and no invoicing (only the customer can start that charge).
 */
const trialWaivesCharge = ({
	trial,
	billsWithoutCustomer,
}: {
	trial: FreeTrialFacts | null;
	billsWithoutCustomer: boolean;
}) =>
	Boolean(
		trial &&
			(trial.on_end === "revert" ||
				(!trial.card_required && !billsWithoutCustomer)),
	);

/**
 * "Charges customer": any new charge, now or later. Each plan is judged on its own,
 * so a trial on one can't hide another's charge; the plans that bill together are
 * judged as a whole too, so two cheaper plans can't hide a higher bill.
 */
export const isBillingChangePaid = ({
	checkout,
	total,
	plans,
	billsWithoutCustomer,
	raisesRecurringPrice,
	raisesNextCycle,
}: {
	checkout: boolean;
	total: number;
	plans: PaidPlanSignals[];
	billsWithoutCustomer: boolean;
	/** All incoming plans against all outgoing ones, phase by phase. */
	raisesRecurringPrice: boolean;
	raisesNextCycle: boolean;
}): boolean => {
	if (checkout || total > 0) return true;

	const waives = (plan: PaidPlanSignals) =>
		trialWaivesCharge({ trial: plan.trial, billsWithoutCustomer });
	const planCharges = (plan: PaidPlanSignals) =>
		!waives(plan) && (plan.raisesRecurringPrice || plan.addsPayPerUsePrice);
	if (plans.some(planCharges)) return true;

	// A request-wide rise is the trials' own unless every incoming plan waives.
	const riseComesOnlyFromTrials = plans.length > 0 && plans.every(waives);
	return (raisesRecurringPrice || raisesNextCycle) && !riseComesOnlyFromTrials;
};
