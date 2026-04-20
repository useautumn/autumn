import type {
	AggregatedFeatureBalance,
	NormalizedFullSubject,
} from "@autumn/shared";
import type { FeatureBalanceResult } from "./getCachedFeatureBalances.js";

/**
 * Replaces stale aggregated_customer_entitlements on the normalized subject
 * with live values read from the shared balance hash `_aggregated` fields.
 */
export const applyLiveAggregatedBalances = ({
	normalized,
	featureBalances,
}: {
	normalized: NormalizedFullSubject;
	featureBalances: FeatureBalanceResult[];
}): void => {
	if (!normalized.entity_aggregations) return;

	const liveByFeatureId = new Map<string, AggregatedFeatureBalance>();
	for (const result of featureBalances) {
		if (result.aggregated) {
			liveByFeatureId.set(result.featureId, result.aggregated);
		}
	}

	if (liveByFeatureId.size === 0) return;

	normalized.entity_aggregations = {
		...normalized.entity_aggregations,
		aggregated_customer_entitlements:
			normalized.entity_aggregations.aggregated_customer_entitlements.map(
				(staleEntry) => {
					const live = liveByFeatureId.get(staleEntry.feature_id);
					if (!live) return staleEntry;
					return { ...staleEntry, ...live };
				},
			),
	};
};
