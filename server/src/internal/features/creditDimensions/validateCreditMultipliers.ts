import type { CreditMultiplier, CreditSchemaItem } from "@autumn/shared";
import { matchesCanCoexist } from "@autumn/shared";
import { Decimal } from "decimal.js";
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
	const factor = Number(multiplier.factor);
	if (hasFactor && !(Number.isFinite(factor) && factor > 0)) {
		invalidCreditSystem(
			`Multiplier "${name}" factor must be greater than zero.`,
		);
	}
	const add = Number(multiplier.add);
	if (hasAdd && !Number.isFinite(add)) {
		invalidCreditSystem(`Multiplier "${name}" add must be a number.`);
	}
	// Coerce in place: a string would concatenate rather than add downstream.
	if (hasFactor) multiplier.factor = factor;
	if (hasAdd) multiplier.add = add;
};

/**
 * A set of multipliers can apply together only if every pair can coexist, so the
 * worst case is the deepest discount over any such set. Grown greedily from each
 * multiplier: enough to catch a genuinely negative rate without enumerating the
 * power set.
 */
const worstCaseRate = ({
	multipliers,
	cheapestRate,
}: {
	multipliers: CreditMultiplier[];
	cheapestRate: number;
}): Decimal =>
	multipliers.reduce((worst, seed) => {
		const stacked: CreditMultiplier[] = [];
		for (const candidate of multipliers) {
			const discounts =
				(candidate.factor !== undefined && candidate.factor < 1) ||
				(candidate.add !== undefined && candidate.add < 0);
			const fitsWithAll = stacked.every((chosen) =>
				matchesCanCoexist(chosen.match, candidate.match),
			);
			if (
				(discounts || candidate === seed) &&
				matchesCanCoexist(seed.match, candidate.match) &&
				fitsWithAll
			) {
				stacked.push(candidate);
			}
		}

		const rate = stacked.reduce(
			(amount, multiplier) =>
				amount
					.mul(
						multiplier.factor !== undefined && multiplier.factor < 1
							? multiplier.factor
							: 1,
					)
					.add(
						multiplier.add !== undefined && multiplier.add < 0
							? multiplier.add
							: 0,
					),
			new Decimal(cheapestRate),
		);
		return Decimal.min(worst, rate);
	}, new Decimal(cheapestRate));

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

	if (worstCaseRate({ multipliers, cheapestRate }).lt(0)) {
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
