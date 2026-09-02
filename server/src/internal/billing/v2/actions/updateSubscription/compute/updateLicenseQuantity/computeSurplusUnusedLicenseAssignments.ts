import {
	type FullCusProduct,
	customerLicenseToUsage,
} from "@autumn/shared";
import { convergeCustomerLicense } from "@/internal/billing/v2/utils/convergeCustomerLicense";
import type { CustomerLicenseQuantityChange } from "@/internal/billing/v2/compute/computeCustomerLicenseQuantityChanges";

/** Oldest-released unused seats beyond what the new granted count still needs. */
export const computeSurplusUnusedLicenseAssignments = ({
	unusedAssignments,
	newGranted,
	used,
}: {
	unusedAssignments: FullCusProduct[];
	newGranted: number;
	used: number;
}): FullCusProduct[] => {
	const keepUnused = Math.max(0, newGranted - used);
	const surplusCount = unusedAssignments.length - keepUnused;
	if (surplusCount <= 0) return [];
	return unusedAssignments.slice(0, surplusCount);
};

export const collectSurplusUnusedLicenseAssignments = ({
	changes,
	unusedLicenseAssignmentsByLinkId,
}: {
	changes: CustomerLicenseQuantityChange[];
	unusedLicenseAssignmentsByLinkId: Record<string, FullCusProduct[]>;
}): FullCusProduct[] =>
	changes.flatMap(({ customerLicense, paidQuantity }) =>
		computeSurplusUnusedLicenseAssignments({
			unusedAssignments:
				unusedLicenseAssignmentsByLinkId[customerLicense.link_id] ?? [],
			newGranted: convergeCustomerLicense({
				customerLicense,
				paidQuantity,
			}).granted,
			used: customerLicenseToUsage({ customerLicense }),
		}),
	);
