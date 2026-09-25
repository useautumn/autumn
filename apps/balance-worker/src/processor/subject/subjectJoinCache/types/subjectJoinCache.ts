import type {
	Catalog,
	SubjectState,
	WorkerFullSubject,
} from "@autumn/balance-engine";

/** What one state was joined into under one catalog revision. */
export type SubjectJoin = {
	catalogRevision: number;
	catalog: Catalog | null;
	fullSubjectByEntityId: Map<string | null, WorkerFullSubject>;
};

/** Each state's joins, kept until the state is replaced or the catalog moves. */
export type SubjectJoinCache = {
	readCatalog(params: { state: SubjectState; join: () => Catalog }): Catalog;
	readFullSubject(params: {
		state: SubjectState;
		entityId: string | null;
		join: () => WorkerFullSubject;
	}): WorkerFullSubject;
};
