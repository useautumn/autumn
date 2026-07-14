import type { Entitlement } from "@models/productModels/entModels/entModels";

/** The identity an entitlement is matched on across definitions (mirrors
 * diffPlanV1's composeMatchKey): feature + reset interval. */
const entitlementMatchKey = (entitlement: Entitlement): string => {
	const interval = entitlement.interval ?? "";
	const intervalCount = interval ? (entitlement.interval_count ?? 1) : "";
	return `${entitlement.internal_feature_id}|${interval}|${intervalCount}`;
};

/**
 * Strict 1:1 successor: exactly one unclaimed candidate shares the source's
 * match key, else undefined — ambiguous (0 or 2+) matches never guess.
 */
export const findEntitlementSuccessor = ({
	sourceEntitlement,
	candidateEntitlements,
	excludedEntitlementIds,
}: {
	sourceEntitlement: Entitlement;
	candidateEntitlements: Entitlement[];
	excludedEntitlementIds?: Set<string>;
}): Entitlement | undefined => {
	const sourceKey = entitlementMatchKey(sourceEntitlement);
	const matches = candidateEntitlements.filter(
		(candidateEntitlement) =>
			!excludedEntitlementIds?.has(candidateEntitlement.id) &&
			entitlementMatchKey(candidateEntitlement) === sourceKey,
	);
	return matches.length === 1 ? matches[0] : undefined;
};
