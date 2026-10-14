import type { CatalogRow } from "@autumn/balance-engine";
import type {
	AtomConnection,
	AtomDeletedSubjectBody,
	AtomSubjectBody,
} from "@autumn/byoc/subjects";
import type { RetryPolicy } from "../retryWithBackoff.js";

export type {
	AtomConnection,
	AtomDeletedSubjectBody,
	AtomQueueAddress,
	AtomSubjectBody,
} from "@autumn/byoc/subjects";

export type AtomDelivery = {
	timeoutMs: number;
	retry: RetryPolicy | null;
};

export type AtomClient = {
	setSubject(params: { body: AtomSubjectBody }): Promise<void>;
	deleteSubject(params: { body: AtomDeletedSubjectBody }): Promise<void>;
	setCatalog(params: { rows: CatalogRow[]; readAt: number }): Promise<void>;
};

export type GetAtomClient = (params: {
	connection: AtomConnection;
}) => AtomClient;
