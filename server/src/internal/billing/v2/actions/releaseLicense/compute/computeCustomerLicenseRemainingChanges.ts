import type { CustomerLicenseUpdate } from "@autumn/shared";

/** Give each pool back one seat per released link occurrence — releases
 * sharing a pool coalesce into a single atomic remaining increment. */
export const computeCustomerLicenseRemainingChanges = ({
	customerLicenseLinkIds,
}: {
	customerLicenseLinkIds: string[];
}): CustomerLicenseUpdate[] => {
	const releasedCountByLinkId = new Map<string, number>();
	for (const customerLicenseLinkId of customerLicenseLinkIds) {
		releasedCountByLinkId.set(
			customerLicenseLinkId,
			(releasedCountByLinkId.get(customerLicenseLinkId) ?? 0) + 1,
		);
	}

	return [...releasedCountByLinkId].map(
		([customerLicenseLinkId, releasedCount]) => ({
			customerLicenseLinkId,
			remainingChange: releasedCount,
		}),
	);
};
