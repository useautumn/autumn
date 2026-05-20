import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

const DEFAULT_CREDIT_COST = 1;

export type CreditCostLookup = (entitlementId: string) => number;

/**
 * Computes the credit cost for each customer entitlement and returns a lookup
 * function. Uses precomputedCreditCost when available (token tracking),
 * otherwise calls getCreditCost per entitlement (credit system schema lookups).
 */
export const computeCreditCosts = async ({
	cusEnts,
	deduction,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	deduction: FeatureDeduction;
}): Promise<CreditCostLookup> => {
	const costMap = new Map<string, number>();

	if (deduction.precomputedCreditCost != null) {
		const cost = deduction.precomputedCreditCost;
		return () => cost;
	}

	await Promise.all(
		cusEnts.map(async (ce) => {
			const creditCost = await getCreditCost({
				featureId: deduction.feature.id,
				creditSystem: ce.entitlement.feature,
				modelName: deduction.tokenUsage?.modelName,
				tokens: deduction.tokenUsage
					? {
							input: deduction.tokenUsage.inputTokens,
							output: deduction.tokenUsage.outputTokens,
						}
					: undefined,
			});
			costMap.set(ce.id, creditCost);
		}),
	);

	return (entitlementId) => costMap.get(entitlementId) ?? DEFAULT_CREDIT_COST;
};
