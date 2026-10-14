import { type EntitlementWithFeature, entsAreSame } from "@autumn/shared";

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
