import type { CreditMultiplier, CreditSchemaItem } from "@autumn/shared";
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
	const discountFactor = multipliers.reduce(
		(product, multiplier) =>
			multiplier.factor !== undefined && multiplier.factor < 1
				? product * multiplier.factor
				: product,
		1,
	);
	const negativeAdds = multipliers.reduce(
		(sum, multiplier) =>
			multiplier.add !== undefined && multiplier.add < 0
				? sum + multiplier.add
				: sum,
		0,
	);

	if (cheapestRate * discountFactor + negativeAdds < 0) {
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
