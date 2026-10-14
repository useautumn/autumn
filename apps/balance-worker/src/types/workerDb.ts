import type { MeteringIdentity } from "@autumn/balance-engine";
import type {
	CatalogRowIds,
	CatalogRowsEnvelope,
	SubjectRowsEnvelope,
} from "@autumn/postgres";

export type WorkerDb = {
	getSubjectRows(params: {
		identity: MeteringIdentity;
		asOfTimestampMs: number;
	}): Promise<SubjectRowsEnvelope | null>;
	readSubjectSnapshot(params: {
		identity: MeteringIdentity;
	}): Promise<unknown | null>;
	readEntitySubjectSnapshots(params: {
		identity: MeteringIdentity;
		entityIds: readonly string[];
	}): Promise<Map<string, unknown>>;
	getEntitySubjectRows(params: {
		identity: MeteringIdentity;
		entityIds: readonly string[];
		asOfTimestampMs: number;
	}): Promise<SubjectRowsEnvelope[]>;
	getCatalogRows(params: {
		identity: MeteringIdentity;
		ids: CatalogRowIds;
	}): Promise<CatalogRowsEnvelope>;
	getBillingCycleAnchors(params: {
		identity: MeteringIdentity;
		customerProductIds: string[];
	}): Promise<Record<string, number>>;
	claimCustomerByEmail(params: {
		identity: MeteringIdentity;
		email: string;
	}): Promise<string | null>;
	sumPooledContributionGrants(params: {
		pooledBalanceIds: string[];
		dueBy: number;
	}): Promise<Record<string, number>>;
	listPooledBalancesWithoutOtherContributions(params: {
		pooledBalanceIds: string[];
		removedContributionIds: string[];
	}): Promise<string[]>;
};
