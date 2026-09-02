import {
	type CreditDimension,
	type CreditMultiplier,
	type CreditSchemaItem,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { invalidCreditRateCard } from "../creditSystemUtils.js";

export type EventProperties = Record<string, unknown> | undefined;

/** A rate-card row with its dimension rules applied: a plain flat or graduated rate, plus which dimension won. */
export type ResolvedCreditSchemaItem = CreditSchemaItem & {
	dimension_name?: string;
};

// An empty match applies to every event, so a missing property bag still matches it.
const matchesEvent = ({
	match,
	eventProperties,
}: {
	match: CreditDimension["match"];
	eventProperties: EventProperties;
}): boolean =>
	usageLimitFilterMatchesProperties({
		filterProperties: match,
		eventProperties: eventProperties ?? {},
	});

const specificity = (dimension: CreditDimension) =>
	Object.keys(dimension.match).length;

const pickWinningDimension = ({
	dimensions,
	eventProperties,
}: {
	dimensions: Record<string, CreditDimension>;
	eventProperties: EventProperties;
}): [string, CreditDimension] | undefined =>
	Object.entries(dimensions)
		.filter(([, dimension]) =>
			matchesEvent({ match: dimension.match, eventProperties }),
		)
		.sort(
			([leftName, left], [rightName, right]) =>
				specificity(right) - specificity(left) ||
				(right.priority ?? 0) - (left.priority ?? 0) ||
				leftName.localeCompare(rightName),
		)[0];

const combineMultipliers = ({
	multipliers,
	eventProperties,
}: {
	multipliers: Record<string, CreditMultiplier>;
	eventProperties: EventProperties;
}) => {
	const matching = Object.values(multipliers).filter((multiplier) =>
		matchesEvent({ match: multiplier.match, eventProperties }),
	);
	const factor = matching.reduce(
		(product, multiplier) => product.mul(multiplier.factor ?? 1),
		new Decimal(1),
	);
	const add = matching.reduce(
		(sum, multiplier) => sum.add(multiplier.add ?? 0),
		new Decimal(0),
	);
	return { factor, add };
};

const scaleAmount = ({
	amount,
	factor,
	add,
	invalidRate,
}: {
	amount: number;
	factor: Decimal;
	add: Decimal;
	invalidRate: (message: string) => never;
}): number => {
	const scaled = new Decimal(amount).mul(factor).add(add);
	if (scaled.lt(0)) {
		invalidRate("Credit multipliers took the rate below zero");
	}
	return scaled.toNumber();
};

/**
 * The most specific matching dimension sets the rate (else the row's own);
 * every matching multiplier scales it, factors first, then adds.
 */
export const resolveCreditDimensionRate = ({
	schemaItem,
	eventProperties,
	creditSystemId,
}: {
	schemaItem: CreditSchemaItem;
	eventProperties: EventProperties;
	creditSystemId: string;
}): ResolvedCreditSchemaItem => {
	const invalidRate = (message: string): never => {
		throw invalidCreditRateCard({
			featureId: schemaItem.metered_feature_id,
			creditSystemId,
			message,
		});
	};

	const { dimensions, multipliers, ...row } = schemaItem;
	const winner = pickWinningDimension({
		dimensions: dimensions ?? {},
		eventProperties,
	});
	const [dimensionName, rate] = winner ?? [undefined, row];
	const { factor, add } = combineMultipliers({
		multipliers: multipliers ?? {},
		eventProperties,
	});
	const scale = (amount: number) =>
		scaleAmount({ amount, factor, add, invalidRate });

	const base = {
		metered_feature_id: row.metered_feature_id,
		...(row.feature_amount === undefined
			? {}
			: { feature_amount: row.feature_amount }),
		...(dimensionName === undefined ? {} : { dimension_name: dimensionName }),
	};

	if (rate.tier_behavior === "graduated") {
		return {
			...base,
			tier_behavior: "graduated",
			tiers: rate.tiers.map((tier) => ({
				to: tier.to,
				credit_amount: scale(tier.credit_amount),
			})),
		};
	}

	return { ...base, credit_amount: scale(rate.credit_amount) };
};
