import type { FullCustomerLicense } from "@autumn/shared";

export type CustomerLicenseSuccessorMatch = {
	outgoingCustomerLicense: FullCustomerLicense;
	incomingCustomerLicense: FullCustomerLicense;
};

export type UnmatchedOutgoingCustomerLicense = {
	outgoingCustomerLicense: FullCustomerLicense;
	reason: "dropped" | "ambiguous";
	group?: string;
};

const licensePlanIdOf = (customerLicense: FullCustomerLicense) =>
	customerLicense.planLicense?.product.id ??
	customerLicense.license_internal_product_id;

/** Empty group never cross-pairs — grouping is the explicit opt-in for
 * "this is the same seat across plans". */
const licenseGroupOf = (customerLicense: FullCustomerLicense) =>
	customerLicense.planLicense?.product.group || null;

/**
 * Ranked successor selection for license pools across a parent plan
 * transition: the same license plan id always wins; otherwise pools pair by
 * their license plan's group, but only when the group resolves 1:1 among the
 * pools no id claimed. Several candidates on either side match nothing.
 */
export const matchCustomerLicenseSuccessors = ({
	outgoingCustomerLicenses,
	incomingCustomerLicenses,
}: {
	outgoingCustomerLicenses: FullCustomerLicense[];
	incomingCustomerLicenses: FullCustomerLicense[];
}): {
	matches: CustomerLicenseSuccessorMatch[];
	unmatched: UnmatchedOutgoingCustomerLicense[];
} => {
	const incomingByLicensePlanId = new Map<string, FullCustomerLicense>();
	for (const incoming of incomingCustomerLicenses) {
		const licensePlanId = licensePlanIdOf(incoming);
		if (!incomingByLicensePlanId.has(licensePlanId)) {
			incomingByLicensePlanId.set(licensePlanId, incoming);
		}
	}

	const idClaimedIncoming = new Set<FullCustomerLicense>();
	for (const outgoing of outgoingCustomerLicenses) {
		const claimed = incomingByLicensePlanId.get(licensePlanIdOf(outgoing));
		if (claimed) idClaimedIncoming.add(claimed);
	}

	const incomingByGroup = new Map<string, FullCustomerLicense[]>();
	for (const incoming of incomingCustomerLicenses) {
		if (idClaimedIncoming.has(incoming)) continue;
		const group = licenseGroupOf(incoming);
		if (!group) continue;
		const rows = incomingByGroup.get(group);
		if (rows) rows.push(incoming);
		else incomingByGroup.set(group, [incoming]);
	}

	const outgoingGroupCounts = new Map<string, number>();
	for (const outgoing of outgoingCustomerLicenses) {
		if (incomingByLicensePlanId.has(licensePlanIdOf(outgoing))) continue;
		const group = licenseGroupOf(outgoing);
		if (!group) continue;
		outgoingGroupCounts.set(group, (outgoingGroupCounts.get(group) ?? 0) + 1);
	}

	const matches: CustomerLicenseSuccessorMatch[] = [];
	const unmatched: UnmatchedOutgoingCustomerLicense[] = [];
	for (const outgoing of outgoingCustomerLicenses) {
		const idMatch = incomingByLicensePlanId.get(licensePlanIdOf(outgoing));
		if (idMatch) {
			matches.push({
				outgoingCustomerLicense: outgoing,
				incomingCustomerLicense: idMatch,
			});
			continue;
		}

		const group = licenseGroupOf(outgoing);
		const candidates = group ? (incomingByGroup.get(group) ?? []) : [];
		if (candidates.length === 0) {
			unmatched.push({ outgoingCustomerLicense: outgoing, reason: "dropped" });
			continue;
		}
		const ambiguous =
			candidates.length > 1 || (outgoingGroupCounts.get(group ?? "") ?? 0) > 1;
		if (ambiguous) {
			unmatched.push({
				outgoingCustomerLicense: outgoing,
				reason: "ambiguous",
				group: group ?? undefined,
			});
			continue;
		}
		matches.push({
			outgoingCustomerLicense: outgoing,
			incomingCustomerLicense: candidates[0],
		});
	}

	return { matches, unmatched };
};
