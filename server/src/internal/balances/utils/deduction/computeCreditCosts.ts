import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

const DEFAULT_CREDIT_COST = 1;

export type CreditCostLookup = (entitlementId: string) => number;

/** Per-entitlement credit cost lookup. Pure schema math — no I/O. */
export const computeCreditCosts = ({
	cusEnts,
	deduction,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	deduction: FeatureDeduction;
}): CreditCostLookup => {
	const costMap = new Map<string, number>();

	for (const ce of cusEnts) {
		// Token cost is USD: 1:1 on its own ent; parents apply their ratio to it.
		if (
			deduction.tokens &&
			ce.entitlement.feature.id === deduction.feature.id
		) {
			costMap.set(ce.id, deduction.tokens.cost);
			continue;
		}

		try {
			costMap.set(
				ce.id,
				getCreditCost({
					featureId: deduction.feature.id,
					creditSystem: ce.entitlement.feature,
					amount: deduction.tokens?.cost,
				}),
			);
		} catch (error) {
			// Cached cusEnt schemas can briefly trail a feature update; deduct at
			// 1:1 rather than failing the track.
			logger.warn("[computeCreditCosts] falling back to credit cost 1", {
				feature_id: deduction.feature.id,
				credit_system_id: ce.entitlement.feature.id,
				customer_entitlement_id: ce.id,
				error: String(error),
			});
			costMap.set(ce.id, DEFAULT_CREDIT_COST);
		}
	}

	return (entitlementId) => costMap.get(entitlementId) ?? DEFAULT_CREDIT_COST;
};
