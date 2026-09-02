import type { CreditDimension, CreditSchemaItem } from "@autumn/shared";
import {
	minimumCreditRateAmount,
	validateCreditRate,
} from "./validateCreditRate.js";

const matchesCanCoexist = (
	left: CreditDimension["match"],
	right: CreditDimension["match"],
): boolean =>
	Object.entries(left).every(
		([key, value]) => right[key] === undefined || right[key] === value,
	);

const sameSpecificity = (
	left: CreditDimension,
	right: CreditDimension,
): boolean =>
	Object.keys(left.match).length === Object.keys(right.match).length &&
	(left.priority ?? null) === (right.priority ?? null);

const validateDimensionsAreSeparable = ({
	dimensions,
	invalidCreditSystem,
}: {
	dimensions: [string, CreditDimension][];
	invalidCreditSystem: (message: string) => never;
}) => {
	for (const [leftIndex, [leftName, left]] of dimensions.entries()) {
		for (const [rightName, right] of dimensions.slice(leftIndex + 1)) {
			const ambiguous =
				sameSpecificity(left, right) &&
				matchesCanCoexist(left.match, right.match);
			if (ambiguous) {
				invalidCreditSystem(
					`Dimensions "${leftName}" and "${rightName}" can both match the same event. Give one more match keys or a priority.`,
				);
			}
		}
	}
};

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

/** Rules that only exist once a rate-card row has dimensions or multipliers. */
export const validateCreditDimensionRules = ({
	schemaItem,
	invalidCreditSystem,
}: {
	schemaItem: CreditSchemaItem;
	invalidCreditSystem: (message: string) => never;
}): void => {
	const dimensions = Object.entries(schemaItem.dimensions ?? {});
	for (const [name, dimension] of dimensions) {
		if (
			dimension.priority !== undefined &&
			!Number.isInteger(dimension.priority)
		) {
			invalidCreditSystem(`Dimension "${name}" priority must be an integer.`);
		}
		validateCreditRate({ rate: dimension, invalidCreditSystem });
	}

	validateDimensionsAreSeparable({ dimensions, invalidCreditSystem });

	for (const [name, multiplier] of Object.entries(
		schemaItem.multipliers ?? {},
	)) {
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
	}

	validateMultipliersKeepRatesNonNegative({ schemaItem, invalidCreditSystem });
};
