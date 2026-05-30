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

	const tokens = deduction.tokenUsage
		? {
				input: deduction.tokenUsage.inputTokens,
				output: deduction.tokenUsage.outputTokens,
			}
		: undefined;

	await Promise.all(
		cusEnts.map(async (ce) => {
			// Precomputed cost (from /track/tokens) is in the AI credit feature's
			// native unit (USD). It applies 1:1 to that feature's own entitlement,
			// but parent credit systems still need their schema ratio applied —
			// fall through to getCreditCost with amount = precomputed cost.
			if (
				deduction.precomputedCreditCost != null &&
				ce.entitlement.feature.id === deduction.feature.id
			) {
				costMap.set(ce.id, deduction.precomputedCreditCost);
				return;
			}

			const creditCost = await getCreditCost({
				featureId: deduction.feature.id,
				creditSystem: ce.entitlement.feature,
				amount: deduction.precomputedCreditCost,
				modelName: deduction.tokenUsage?.modelName,
				tokens,
			});
			costMap.set(ce.id, creditCost);
		}),
	);

	return (entitlementId) => costMap.get(entitlementId) ?? DEFAULT_CREDIT_COST;
};
