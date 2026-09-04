import type { CreditMultiplier, CreditSchemaItem } from "@autumn/shared";
import { matchesCanCoexist } from "@autumn/shared";
import { minimumCreditRateAmount } from "../validateCreditRate.js";

const validateMultiplierShape = ({
	name,
	multiplier,
	invalidCreditSystem,
}: {
	name: string;
	multiplier: CreditMultiplier;
	invalidCreditSystem: (message: string) => never;
}) => {
	const hasFactor = multiplier.factor !== undefined;
	const hasAdd = multiplier.add !== undefined;
	if (!hasFactor && !hasAdd) {
		invalidCreditSystem(`Multiplier "${name}" needs a factor or an add.`);
	}
	if (hasFactor && !(Number(multiplier.factor) > 0)) {
		invalidCreditSystem(
			`Multiplier "${name}" factor must be greater than zero.`,
		);
	}
	if (hasAdd && !Number.isFinite(Number(multiplier.add))) {
		invalidCreditSystem(`Multiplier "${name}" add must be a number.`);
	}
};

/** Worst case is every discount stacking on the cheapest rate; that must still be ≥ 0. */
const validateMultipliersKeepRatesNonNegative = ({
	schemaItem,
	invalidCreditSystem,
}: {
	schemaItem: CreditSchemaItem;
	invalidCreditSystem: (message: string) => never;
}) => {
	const multipliers = Object.values(schemaItem.multipliers ?? {});
	const rates = [schemaItem, ...Object.values(schemaItem.dimensions ?? {})];
	const cheapestRate = Math.min(...rates.map(minimumCreditRateAmount));

	// Only multipliers that could match one event stack, so the worst case is the
	// deepest discount over a set whose matches all coexist.
	const worstCaseDiscount = multipliers.reduce((worst, multiplier) => {
		const stacked = multipliers.filter((other) =>
			matchesCanCoexist(multiplier.match, other.match),
		);
		const factor = stacked.reduce(
			(product, other) =>
				other.factor !== undefined && other.factor < 1
					? product * other.factor
					: product,
			1,
		);
		const adds = stacked.reduce(
			(sum, other) =>
				other.add !== undefined && other.add < 0 ? sum + other.add : sum,
			0,
		);
		return Math.min(worst, cheapestRate * factor + adds);
	}, cheapestRate);

	if (worstCaseDiscount < 0) {
		invalidCreditSystem(
			`Multipliers on ${schemaItem.metered_feature_id} can take a rate below zero.`,
		);
	}
};

export const validateCreditMultipliers = ({
	schemaItem,
	invalidCreditSystem,
}: {
	schemaItem: CreditSchemaItem;
	invalidCreditSystem: (message: string) => never;
}): void => {
	for (const [name, multiplier] of Object.entries(
		schemaItem.multipliers ?? {},
	)) {
		validateMultiplierShape({ name, multiplier, invalidCreditSystem });
	}
	validateMultipliersKeepRatesNonNegative({ schemaItem, invalidCreditSystem });
};
