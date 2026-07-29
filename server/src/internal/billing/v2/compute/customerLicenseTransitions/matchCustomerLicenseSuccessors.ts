import type { FullCustomerLicense, FullPlanLicense } from "@autumn/shared";

export type CustomerLicenseSuccessorMatch = {
	outgoingCustomerLicense: FullCustomerLicense;
	incomingCustomerLicense: FullCustomerLicense;
};

export type UnmatchedOutgoingCustomerLicense = {
	outgoingCustomerLicense: FullCustomerLicense;
	reason: "dropped" | "ambiguous";
	group?: string;
};

export type CustomerLicensePlanSuccessorMatch = {
	outgoingCustomerLicense: FullCustomerLicense;
	incomingPlanLicense: FullPlanLicense;
};

const licensePlanIdOf = (customerLicense: FullCustomerLicense) =>
	customerLicense.planLicense?.product.id ??
	customerLicense.license_internal_product_id;

/** Empty group never cross-pairs — grouping is the explicit opt-in for
 * "this is the same seat across plans". */
const licenseGroupOf = (customerLicense: FullCustomerLicense) =>
	customerLicense.planLicense?.product.group || null;

type LicenseCandidate<T> = {
	value: T;
	licensePlanId: string;
	group: string | null;
};

const matchLicenseSuccessorCandidates = <Outgoing, Incoming>({
	outgoingCandidates,
	incomingCandidates,
}: {
	outgoingCandidates: LicenseCandidate<Outgoing>[];
	incomingCandidates: LicenseCandidate<Incoming>[];
}) => {
	const incomingByLicensePlanId = new Map<string, LicenseCandidate<Incoming>>();
	for (const incoming of incomingCandidates) {
		if (!incomingByLicensePlanId.has(incoming.licensePlanId)) {
			incomingByLicensePlanId.set(incoming.licensePlanId, incoming);
		}
	}

	const idClaimedIncoming = new Set<Incoming>();
	for (const outgoing of outgoingCandidates) {
		const claimed = incomingByLicensePlanId.get(outgoing.licensePlanId);
		if (claimed) idClaimedIncoming.add(claimed.value);
	}

	const incomingByGroup = new Map<string, LicenseCandidate<Incoming>[]>();
	for (const incoming of incomingCandidates) {
		if (idClaimedIncoming.has(incoming.value)) continue;
		const group = incoming.group;
		if (!group) continue;
		const rows = incomingByGroup.get(group);
		if (rows) rows.push(incoming);
		else incomingByGroup.set(group, [incoming]);
	}

	const outgoingGroupCounts = new Map<string, number>();
	for (const outgoing of outgoingCandidates) {
		if (incomingByLicensePlanId.has(outgoing.licensePlanId)) continue;
		const group = outgoing.group;
		if (!group) continue;
		outgoingGroupCounts.set(group, (outgoingGroupCounts.get(group) ?? 0) + 1);
	}

	const matches: { outgoing: Outgoing; incoming: Incoming }[] = [];
	const unmatched: {
		outgoing: Outgoing;
		reason: "dropped" | "ambiguous";
		group?: string;
	}[] = [];
	for (const outgoing of outgoingCandidates) {
		const idMatch = incomingByLicensePlanId.get(outgoing.licensePlanId);
		if (idMatch) {
			matches.push({ outgoing: outgoing.value, incoming: idMatch.value });
			continue;
		}

		const group = outgoing.group;
		const candidates = group ? (incomingByGroup.get(group) ?? []) : [];
		if (candidates.length === 0) {
			unmatched.push({ outgoing: outgoing.value, reason: "dropped" });
			continue;
		}
		const ambiguous =
			candidates.length > 1 || (outgoingGroupCounts.get(group ?? "") ?? 0) > 1;
		if (ambiguous) {
			unmatched.push({
				outgoing: outgoing.value,
				reason: "ambiguous",
				group: group ?? undefined,
			});
			continue;
		}
		matches.push({ outgoing: outgoing.value, incoming: candidates[0].value });
	}

	return { matches, unmatched };
};

const customerLicenseToCandidate = (
	customerLicense: FullCustomerLicense,
): LicenseCandidate<FullCustomerLicense> => ({
	value: customerLicense,
	licensePlanId: licensePlanIdOf(customerLicense),
	group: licenseGroupOf(customerLicense),
});

const planLicenseToCandidate = (
	planLicense: FullPlanLicense,
): LicenseCandidate<FullPlanLicense> => ({
	value: planLicense,
	licensePlanId: planLicense.product.id,
	group: planLicense.product.group || null,
});

/** Matches pools by exact license plan, then by an unambiguous 1:1 group. */
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
	const { matches, unmatched } = matchLicenseSuccessorCandidates({
		outgoingCandidates: outgoingCustomerLicenses.map(
			customerLicenseToCandidate,
		),
		incomingCandidates: incomingCustomerLicenses.map(
			customerLicenseToCandidate,
		),
	});

	return {
		matches: matches.map(({ outgoing, incoming }) => ({
			outgoingCustomerLicense: outgoing,
			incomingCustomerLicense: incoming,
		})),
		unmatched: unmatched.map(({ outgoing, reason, group }) => ({
			outgoingCustomerLicense: outgoing,
			reason,
			group,
		})),
	};
};

export const matchCustomerLicensePlanSuccessors = ({
	outgoingCustomerLicenses,
	incomingPlanLicenses,
}: {
	outgoingCustomerLicenses: FullCustomerLicense[];
	incomingPlanLicenses: FullPlanLicense[];
}): {
	matches: CustomerLicensePlanSuccessorMatch[];
	unmatched: UnmatchedOutgoingCustomerLicense[];
} => {
	const { matches, unmatched } = matchLicenseSuccessorCandidates({
		outgoingCandidates: outgoingCustomerLicenses.map(
			customerLicenseToCandidate,
		),
		incomingCandidates: incomingPlanLicenses.map(planLicenseToCandidate),
	});

	return {
		matches: matches.map(({ outgoing, incoming }) => ({
			outgoingCustomerLicense: outgoing,
			incomingPlanLicense: incoming,
		})),
		unmatched: unmatched.map(({ outgoing, reason, group }) => ({
			outgoingCustomerLicense: outgoing,
			reason,
			group,
		})),
	};
};

export const matchCustomerLicensesToPlanLicenses = (params: {
	outgoingCustomerLicenses: FullCustomerLicense[];
	incomingPlanLicenses: FullPlanLicense[];
}): CustomerLicensePlanSuccessorMatch[] => {
	return matchCustomerLicensePlanSuccessors(params).matches;
};
