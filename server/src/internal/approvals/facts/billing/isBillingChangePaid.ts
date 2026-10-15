import type { IncomingPlanFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

/**
 * "Charges customer": any new charge, now or later. Checkout links count,
 * because the rep sets the charge up. A card-less trial with no card on file
 * doesn't, because only the customer can start that charge by adding one.
 */
export const isBillingChangePaid = ({
	checkout,
	total,
	incoming,
	hasPaymentMethod,
	raisesNextCycle,
	addsPayPerUsePrice,
}: {
	checkout: boolean;
	total: number;
	incoming: IncomingPlanFacts[];
	hasPaymentMethod: boolean;
	raisesNextCycle: boolean;
	addsPayPerUsePrice: boolean;
}): boolean => {
	if (checkout) return true;
	if (total > 0) return true;

	const startsCardlessTrial =
		!hasPaymentMethod &&
		incoming.some(
			({ free_trial: freeTrial }) => freeTrial && !freeTrial.card_required,
		);
	if (startsCardlessTrial) return false;

	return raisesNextCycle || addsPayPerUsePrice;
};
