import type { MeteringIdentity } from "@autumn/balance-engine";
import type {
	CatalogRowIds,
	CatalogRowsEnvelope,
	SubjectRowsEnvelope,
} from "@autumn/postgres";

/** Postgres as the worker reads it: the two repos it needs, bound to the pool and scoped per call. Tests stand these in. */
export type WorkerDb = {
	getSubjectRows(params: {
		identity: MeteringIdentity;
		asOfTimestampMs: number;
	}): Promise<SubjectRowsEnvelope | null>;
	getCatalogRows(params: {
		identity: MeteringIdentity;
		ids: CatalogRowIds;
	}): Promise<CatalogRowsEnvelope>;
};
