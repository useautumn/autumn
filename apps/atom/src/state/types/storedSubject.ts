import type { Catalog, SubjectState } from "@autumn/balance-engine";
import type { SharedContext } from "@autumn/shared";

/** One subject as Autumn last sent it: the engine's rows, the catalog rows they reference, and the org settings a check reads. */
export type StoredSubject = {
	state: SubjectState;
	catalog: Catalog;
	org: SharedContext["org"];
	/** The balance-log offset the subject was read after. */
	logOffset: bigint;
	/** When Autumn read the subject from its worker, in epoch ms. */
	readAt: number;
	/** On the customer's own part, the log offset of its latest evict: an entity part read from before it may be stale. 0n on an entity's part. */
	customerVersion: bigint;
};
