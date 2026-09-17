import type { CreditRateCard, CreditTier } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const CREDIT_RATE_EPSILON = 1e-10;

const tiersOf = ({ rateCard }: { rateCard: CreditRateCard }): CreditTier[] =>
	rateCard.tier_behavior === "graduated"
		? rateCard.tiers
		: [{ to: "inf", credit_amount: rateCard.credit_amount }];

/** `credit_rate_units_for_credit_change`: how many of `requestedUnits` the allowed credits pay for, walking the tiers from `currentUnits`. */
export const creditRateUnitsForCreditChange = ({
	rateCard,
	currentUnits,
	requestedUnits,
	allowedCreditChange,
}: {
	rateCard: CreditRateCard;
	currentUnits: Decimal;
	requestedUnits: Decimal;
	allowedCreditChange: Decimal;
}): Decimal => {
	const current = Decimal.max(currentUnits, 0);
	let allowedCredits = allowedCreditChange.abs();
	let remainingUnits = requestedUnits.abs();
	const direction = requestedUnits.lt(0) ? -1 : 1;
	if (remainingUnits.lte(CREDIT_RATE_EPSILON)) return new Decimal(0);
	if (direction < 0) remainingUnits = Decimal.min(remainingUnits, current);

	const featureAmount = new Decimal(rateCard.feature_amount);
	const tiers = tiersOf({ rateCard });
	let position = current;
	let appliedUnits = new Decimal(0);

	const apply = ({
		segmentUnits,
		tier,
	}: {
		segmentUnits: Decimal;
		tier: CreditTier;
	}) => {
		const unitCost = new Decimal(tier.credit_amount).div(featureAmount);
		let unitsToApply = segmentUnits;
		if (unitCost.gt(CREDIT_RATE_EPSILON)) {
			unitsToApply = Decimal.min(segmentUnits, allowedCredits.div(unitCost));
			allowedCredits = Decimal.max(
				allowedCredits.minus(unitsToApply.times(unitCost)),
				0,
			);
		}
		position =
			direction > 0
				? position.plus(unitsToApply)
				: position.minus(unitsToApply);
		appliedUnits = appliedUnits.plus(unitsToApply);
		remainingUnits = remainingUnits.minus(unitsToApply);
		return unitsToApply.plus(CREDIT_RATE_EPSILON).lt(segmentUnits);
	};

	if (direction > 0) {
		let previousBoundary = new Decimal(0);
		for (const tier of tiers) {
			if (remainingUnits.lte(CREDIT_RATE_EPSILON)) break;
			const boundary =
				tier.to === "inf"
					? position.plus(remainingUnits)
					: new Decimal(tier.to);
			if (position.lt(boundary)) {
				const segmentStart = Decimal.max(position, previousBoundary);
				const segmentUnits = Decimal.min(
					remainingUnits,
					Decimal.max(boundary.minus(segmentStart), 0),
				);
				if (apply({ segmentUnits, tier })) break;
			}
			if (tier.to !== "inf") previousBoundary = boundary;
		}
	} else {
		for (let index = tiers.length - 1; index >= 0; index--) {
			if (remainingUnits.lte(CREDIT_RATE_EPSILON)) break;
			const tier = tiers[index];
			if (!tier) break;
			const previous = tiers[index - 1];
			const lowerBoundary =
				index === 0 || !previous || previous.to === "inf"
					? new Decimal(0)
					: new Decimal(previous.to);
			const upperBoundary = tier.to === "inf" ? position : new Decimal(tier.to);
			if (position.gt(lowerBoundary) && position.lte(upperBoundary)) {
				const segmentUnits = Decimal.min(
					remainingUnits,
					position.minus(lowerBoundary),
				);
				if (apply({ segmentUnits, tier })) break;
			}
		}
	}

	return appliedUnits.times(direction);
};
