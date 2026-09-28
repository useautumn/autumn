import type { CreditSchemaItem } from "@autumn/shared";
import { invalidCreditRateCard } from "../creditSystemUtils.js";
import { combineCreditMultipliers } from "./combineCreditMultipliers.js";
import type { EventProperties } from "./matchesEventProperties.js";
import { pickWinningDimension } from "./pickWinningDimension.js";
import { scaleCreditAmount } from "./scaleCreditAmount.js";

export type { EventProperties } from "./matchesEventProperties.js";

/**
 * A rate-card row with its dimension rules applied: the rules are spent, so the
 * result is a plain flat or graduated rate plus the name of the dimension that won.
 */
type WithoutRules<T> = T extends unknown
	? Omit<T, "dimensions" | "multipliers"> & { dimension_name?: string }
	: never;

export type ResolvedCreditSchemaItem = WithoutRules<CreditSchemaItem>;

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
	const combined = combineCreditMultipliers({
		multipliers: multipliers ?? {},
		eventProperties,
	});
	const scale = (amount: number) =>
		scaleCreditAmount({ amount, multipliers: combined, invalidRate });

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
