import { entsAreSame, type EntitlementWithFeature } from "@autumn/shared";

/** Live ids whose definition matches the catalog from-entitlement. Exact id
 * always counts; entsAreSame catches custom/old rows with the same meaning. */
export const expandFromLicenseEntitlementIds = ({
	candidateOutgoingEntitlements,
	fromEntitlement,
	toEntitlementId,
}: {
	candidateOutgoingEntitlements: EntitlementWithFeature[];
	fromEntitlement: EntitlementWithFeature;
	toEntitlementId: string;
}): string[] => {
	const fromEntitlementIds: string[] = [];
	for (const candidate of candidateOutgoingEntitlements) {
		if (candidate.id === toEntitlementId) continue;
		if (
			candidate.id === fromEntitlement.id ||
			entsAreSame(candidate, fromEntitlement)
		) {
			fromEntitlementIds.push(candidate.id);
		}
	}
	return fromEntitlementIds;
};
