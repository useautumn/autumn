import type { UsageTier } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { Decimal } from "decimal.js";

/**
 * Subtracts included usage from tier `to` values (user-facing → internal).
 * Infinite (`"inf"`) tier `to` values are left unchanged.
 */
export const subtractIncludedFromTiers = ({
	tiers,
	included,
}: {
	tiers: UsageTier[];
	included: number;
}): UsageTier[] => {
	if (included === 0) return tiers;

	return tiers.map((tier) => ({
		amount: tier.amount,
		to:
			typeof tier.to === "number" && tier.to > 0
				? new Decimal(tier.to).minus(included).toNumber()
				: tier.to,
	}));
};

/**
 * Adds included usage to tier `to` values (internal → user-facing).
 * Infinite (`"inf"`) tier `to` values are left unchanged.
 */
export const addIncludedToTiers = <
	T extends { to: number | string; amount: number },
>({
	tiers,
	included,
}: {
	tiers: T[];
	included: number;
}): T[] => {
	if (included === 0) return tiers;

	return tiers.map((tier) => ({
		...tier,
		to:
			typeof tier.to === "number" && tier.to > 0
				? new Decimal(tier.to).plus(included).toNumber()
				: tier.to,
	}));
};

export const addAllowanceToTiers = <
	T extends { to: number | "inf"; amount: number },
>({
	tiers,
	allowance,
}: {
	tiers: T[];
	allowance: number;
}): T[] => {
	if (allowance === 0) return tiers;

	const firstTier = {
		to: allowance,
		amount: 0,
	} as T;

	const tiersWithAllowance = addIncludedToTiers({
		tiers,
		included: allowance,
	});

	return [firstTier, ...tiersWithAllowance];
};
