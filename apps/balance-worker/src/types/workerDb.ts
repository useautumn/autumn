import type { MeteringIdentity } from "@autumn/balance-engine";
import type {
	CatalogRowIds,
	CatalogRowsEnvelope,
	SubjectRowsEnvelope,
} from "@autumn/postgres";

/** Postgres as the worker reads it: the repos it needs, bound to the pool and scoped per call. Tests stand these in. */
export type WorkerDb = {
	getSubjectRows(params: {
		identity: MeteringIdentity;
		asOfTimestampMs: number;
	}): Promise<SubjectRowsEnvelope | null>;
	getCatalogRows(params: {
		identity: MeteringIdentity;
		ids: CatalogRowIds;
	}): Promise<CatalogRowsEnvelope>;
	/** Subscription billing anchors by customer product id, for the plans whose reset the anchor can move. */
	getBillingCycleAnchors(params: {
		identity: MeteringIdentity;
		customerProductIds: string[];
	}): Promise<Record<string, number>>;
	/** Gives the email-only customer with this email the identity's customer id; its internal id, or null when none. */
	claimCustomerByEmail(params: {
		identity: MeteringIdentity;
		email: string;
	}): Promise<string | null>;
	/** Each pool's grant once its shares due by `dueBy` take their next value, by pool id; pools with no shares are absent. */
	sumPooledContributionGrants(params: {
		pooledBalanceIds: string[];
		dueBy: number;
	}): Promise<Record<string, number>>;
	/** The pools among `pooledBalanceIds` left with no share once `removedContributionIds` go; license pools never. */
	listPooledBalancesWithoutOtherContributions(params: {
		pooledBalanceIds: string[];
		removedContributionIds: string[];
	}): Promise<string[]>;
};
