import {
	type CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	getCycleEnd,
} from "@autumn/shared";

export type CycleEnrichmentCandidate = {
	customerProductId: string;
	internalCustomerId: string;
	customerId: string | null;
	entityId: string | null;
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
	isPaidRecurring: boolean;
	billingCycleAnchor: number | null;
	subscriptionCycleAnchor: number | null;
	siblingResetCycleAnchor: number | null;
};

export type CycleFields = {
	resetCycleAnchor: number | null;
	nextResetAt: number | null;
};

export type EnrichedCycleCandidate = CycleEnrichmentCandidate & CycleFields;

export type CycleEnrichmentResult<
	Candidate extends CycleEnrichmentCandidate = CycleEnrichmentCandidate,
> = {
	rows: (Candidate & CycleFields)[];
	excludedInternalCustomerIds: string[];
};

const resolveAnchor = ({
	candidate,
	now,
}: {
	candidate: CycleEnrichmentCandidate;
	now: number;
}): number =>
	candidate.siblingResetCycleAnchor ??
	candidate.billingCycleAnchor ??
	candidate.subscriptionCycleAnchor ??
	(candidate.isPaidRecurring ? now : (candidate.startsAt ?? now));

export const enrichCustomerEntitlementCycles = <
	Candidate extends CycleEnrichmentCandidate,
>({
	candidates,
	entitlement,
	now,
}: {
	candidates: Candidate[];
	entitlement: EntitlementWithFeature;
	now: number;
}): CycleEnrichmentResult<Candidate> => {
	const rows = candidates.map((candidate) => {
		const anchor = resolveAnchor({ candidate, now });
		return {
			...candidate,
			resetCycleAnchor: anchor,
			nextResetAt: getCycleEnd({
				anchor,
				interval: entitlement.interval ?? EntInterval.Month,
				intervalCount: entitlement.interval_count,
				now,
			}),
		};
	});

	return { rows, excludedInternalCustomerIds: [] };
};
