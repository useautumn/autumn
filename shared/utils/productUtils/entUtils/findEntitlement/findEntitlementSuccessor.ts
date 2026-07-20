import type { Entitlement } from "@models/productModels/entModels/entModels";
import { entsAreSame } from "../compareEnt/entsAreSame.js";

export enum EntitlementMatchPrecision {
	Definition = "definition",
	Interval = "interval",
	Feature = "feature",
}

export const ENTITLEMENT_MATCH_PRECISIONS = [
	EntitlementMatchPrecision.Definition,
	EntitlementMatchPrecision.Interval,
	EntitlementMatchPrecision.Feature,
] as const;

const entitlementIntervalKey = (entitlement: Entitlement): string => {
	const interval = entitlement.interval ?? "";
	const intervalCount = interval ? (entitlement.interval_count ?? 1) : "";
	return `${entitlement.internal_feature_id}|${interval}|${intervalCount}`;
};

const entitlementsMatchAtPrecision = ({
	sourceEntitlement,
	candidateEntitlement,
	matchPrecision,
}: {
	sourceEntitlement: Entitlement;
	candidateEntitlement: Entitlement;
	matchPrecision: EntitlementMatchPrecision;
}) => {
	if (matchPrecision === EntitlementMatchPrecision.Definition) {
		return entsAreSame(sourceEntitlement, candidateEntitlement);
	}

	if (matchPrecision === EntitlementMatchPrecision.Interval) {
		return (
			entitlementIntervalKey(sourceEntitlement) ===
			entitlementIntervalKey(candidateEntitlement)
		);
	}

	return (
		sourceEntitlement.internal_feature_id ===
		candidateEntitlement.internal_feature_id
	);
};

/** Finds the best unclaimed candidate from most to least precise. */
export const findEntitlementSuccessor = <T extends Entitlement>({
	sourceEntitlement,
	candidateEntitlements,
	excludedEntitlementIds,
	matchPrecision,
}: {
	sourceEntitlement: Entitlement;
	candidateEntitlements: T[];
	excludedEntitlementIds?: Set<string>;
	matchPrecision?: EntitlementMatchPrecision;
}): T | undefined => {
	const matchPrecisions = matchPrecision
		? [matchPrecision]
		: ENTITLEMENT_MATCH_PRECISIONS;

	for (const currentMatchPrecision of matchPrecisions) {
		const candidate = candidateEntitlements.find(
			(candidateEntitlement) =>
				!excludedEntitlementIds?.has(candidateEntitlement.id) &&
				entitlementsMatchAtPrecision({
					sourceEntitlement,
					candidateEntitlement,
					matchPrecision: currentMatchPrecision,
				}),
		);
		if (candidate) return candidate;
	}

	return undefined;
};
