import type {
	Catalog,
	SubjectState,
	WorkerFullSubject,
} from "@autumn/balance-engine";

/** What one state was joined into while the catalog stood at one change count. */
export type SubjectJoin = {
	catalogChangeCount: number;
	catalog: Catalog | null;
	fullSubjectByEntityId: Map<string | null, WorkerFullSubject>;
};

/** Each state's joins, kept until the state is replaced or the catalog moves. */
export type SubjectJoinCache = {
	/** The catalog already joined for this state at the catalog's current change count, or null. */
	peekCatalog(params: { state: SubjectState }): Catalog | null;
	readCatalog(params: { state: SubjectState; join: () => Catalog }): Catalog;
	readFullSubject(params: {
		state: SubjectState;
		entityId: string | null;
		join: () => WorkerFullSubject;
	}): WorkerFullSubject;
};
