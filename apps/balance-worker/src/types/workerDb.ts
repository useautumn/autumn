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
	/** Promotes a pool's due contributions and returns its grant now; null when the pool has no contributions. */
	promoteDuePooledContributions(params: {
		pooledBalanceId: string;
		now: number;
	}): Promise<number | null>;
};
