import type { Catalog, CommandOrg, SubjectState } from "@autumn/balance-engine";

/** One subject as Autumn last sent it: the engine's rows, the catalog rows they reference, and the org settings a check reads. */
export type StoredSubject = {
	state: SubjectState;
	catalog: Catalog;
	org: CommandOrg;
	/** The balance-log offset the subject was read after. */
	logOffset: bigint;
};
