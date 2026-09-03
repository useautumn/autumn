import type { FullCustomerLicense } from "@autumn/shared";
import { computeSurplusUnusedLicenseAssignments } from "./computeSurplusUnusedLicenseAssignments";

export const collectSurplusUnusedAssignmentIds = ({
	unusedAssignments,
	customerLicenses,
}: {
	unusedAssignments: {
		id: string;
		customer_license_link_id: string | null;
	}[];
	customerLicenses: Pick<FullCustomerLicense, "link_id" | "remaining">[];
}): string[] => {
	const unusedByLinkId = new Map<string, { id: string }[]>();
	for (const assignment of unusedAssignments) {
		const linkId = assignment.customer_license_link_id;
		if (!linkId) continue;
		const unused = unusedByLinkId.get(linkId) ?? [];
		unused.push(assignment);
		unusedByLinkId.set(linkId, unused);
	}

	return customerLicenses.flatMap((customerLicense) =>
		computeSurplusUnusedLicenseAssignments({
			unusedAssignments: unusedByLinkId.get(customerLicense.link_id) ?? [],
			remaining: customerLicense.remaining,
		}).map((assignment) => assignment.id),
	);
};
