import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

const DEFAULT_CREDIT_COST = 1;

export type CreditCostLookup = (entitlementId: string) => number;

/**
 * Computes the credit cost for each customer entitlement and returns a lookup
 * function. Token deductions carry their USD cost from the API layer; all other
 * costs come from credit system schema ratios.
 */
export const computeCreditCosts = async ({
	cusEnts,
	deduction,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	deduction: FeatureDeduction;
}): Promise<CreditCostLookup> => {
	const costMap = new Map<string, number>();

	await Promise.all(
		cusEnts.map(async (ce) => {
			// A token deduction's cost is in the AI feature's native unit (USD): it
			// applies 1:1 to its own entitlement, while parent credit systems apply
			// their schema ratio to it via getCreditCost's amount.
			if (
				deduction.tokens &&
				ce.entitlement.feature.id === deduction.feature.id
			) {
				costMap.set(ce.id, deduction.tokens.cost);
				return;
			}

			const creditCost = await getCreditCost({
				featureId: deduction.feature.id,
				creditSystem: ce.entitlement.feature,
				amount: deduction.tokens?.cost,
			});
			costMap.set(ce.id, creditCost);
		}),
	);

	return (entitlementId) => costMap.get(entitlementId) ?? DEFAULT_CREDIT_COST;
};
