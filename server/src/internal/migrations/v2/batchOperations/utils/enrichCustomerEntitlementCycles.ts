import {
	type CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	getCycleEnd,
} from "@autumn/shared";

/** One candidate customer product with its possible anchor sources, as
 * selected by the page's candidate query. Lifecycle fields feed the webhook
 * plan-change snapshot without a re-read. */
export type CycleEnrichmentCandidate = {
	customerProductId: string;
	internalCustomerId: string;
	customerId: string | null;
	/** Public id of the owning entity when the customer product is entity-level. */
	entityId: string | null;
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
	/** ≥1 recurring customer price on THIS cusProduct (per-customer truth). */
	isPaidRecurring: boolean;
	/** customer_products.billing_cycle_anchor (recent attaches). */
	billingCycleAnchor: number | null;
	/** subscriptions.billing_cycle_anchor_seconds × 1000 (ms; null until backfilled). */
	subscriptionCycleAnchor: number | null;
	/** reset_cycle_anchor of a same-interval sibling cusEnt on this product. */
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
	/** Customers a rung refused — routed to skipped (per-customer lane). */
	excludedInternalCustomerIds: string[];
};

/** setupResetCycleAnchor parity: paid recurring falls through to the billing
 * anchor ("now" when unknown); free/one-off keep starts_at ?? "now". */
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

/**
 * Resolves per-row reset cycles for a RESETTING (consumable/credit) batch add
 * via the anchor ladder: sibling cusEnt anchor → cp anchor → subscription
 * anchor → setupResetCycleAnchor-parity fallback. nextResetAt always steps
 * through getCycleEnd — the same primitive the per-customer init path uses.
 */
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
