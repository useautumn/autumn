import { type CreditRateCard, creditRateToCost } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { DeductionContext } from "../../../deduction/types/deductionContext.js";
import type { DeductionDelta } from "../../../deduction/types/deductionDelta.js";
import type { DeductionRow } from "../../../deduction/types/deductionRow.js";
import { deductionRowToRateUnits } from "../../../deduction/utils/convertDeductionUtils.js";
import { CREDIT_RATE_EPSILON } from "../../../deduction/utils/credits/creditRateUnitsForCreditChange.js";

/** The inverse of `share` of one delta at the flat cost it was taken at. */
const flatInverseOf = ({
	delta,
	share,
}: {
	delta: DeductionDelta;
	share: Decimal;
}): DeductionDelta => {
	const back = (value: number): number =>
		new Decimal(value).mul(share).neg().toNumber();
	return {
		...delta,
		balanceDelta: back(delta.balanceDelta),
		usageDelta: back(delta.usageDelta),
		valueDelta: back(delta.valueDelta),
	};
};

/**
 * `calculate_rate_card_unwind_change`: a graduated rate gives back its current marginal tail, not what the
 * lock paid, so the row's attributed credits stay equal to the cumulative cost of its units.
 */
const rateCardInverseOf = ({
	context,
	row,
	delta,
	taken,
	unwound,
}: {
	context: DeductionContext;
	row: DeductionRow & { rateCard: CreditRateCard };
	delta: DeductionDelta & {
		usageAttributionDelta: NonNullable<DeductionDelta["usageAttributionDelta"]>;
	};
	taken: Decimal;
	unwound: DeductionDelta[];
}): DeductionDelta => {
	const currentUnits = Decimal.max(
		deductionRowToRateUnits({ row, deltas: unwound }),
		0,
	);
	const lockCharged = delta.usageAttributionDelta.units >= 0;
	// Attribution stops at zero; units below it are net-negative usage, which a rate card does not credit.
	const units = lockCharged ? Decimal.min(taken, currentUnits).neg() : taken;
	const credits = new Decimal(
		creditRateToCost({
			featureId: context.featureId,
			creditSystemId: row.featureId,
			rate: row.rateCard,
			amount: units.toNumber(),
			currentUsage: currentUnits.toNumber(),
		}),
	);
	return {
		...delta,
		balanceDelta: credits.neg().toNumber(),
		usageDelta: delta.usageDelta === 0 ? 0 : credits.toNumber(),
		valueDelta: units.neg().toNumber(),
		creditCost: units.abs().lte(CREDIT_RATE_EPSILON)
			? 0
			: credits.div(units).toNumber(),
		usageAttributionDelta: {
			...delta.usageAttributionDelta,
			units: units.toNumber(),
			credits: credits.toNumber(),
		},
	};
};

/** Moves `taken` of one delta back, repriced when the row it sat on is still charged through a rate card. */
export const inverseLockDelta = ({
	context,
	delta,
	taken,
	unwound,
}: {
	context: DeductionContext;
	delta: DeductionDelta;
	taken: Decimal;
	unwound: DeductionDelta[];
}): DeductionDelta => {
	const row = [...context.rows, ...context.rolloverRows].find(
		(candidate) =>
			candidate.id === delta.id && candidate.entityKey === delta.entityKey,
	);
	const { usageAttributionDelta } = delta;
	if (row?.rateCard && usageAttributionDelta)
		return rateCardInverseOf({
			context,
			row: { ...row, rateCard: row.rateCard },
			delta: { ...delta, usageAttributionDelta },
			taken,
			unwound,
		});
	return flatInverseOf({
		delta,
		share: taken.div(new Decimal(delta.valueDelta).abs()),
	});
};
