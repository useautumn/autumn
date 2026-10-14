import type {
	Catalog,
	RowChange,
	SubjectState,
	WorkerFullSubject,
} from "@autumn/balance-engine";

export type SubjectJoin = {
	basis: Catalog | null;
	catalog: Catalog | null;
	catalogJoinedAt: number | null;
	fullSubjectByEntityId: Map<string | null, WorkerFullSubject>;
};

export type SubjectJoinCache = {
	peekCatalog(params: { state: SubjectState }): Catalog | null;
	readCatalog(params: { state: SubjectState; join: () => Catalog }): Catalog;
	readFullSubject(params: {
		state: SubjectState;
		entityId: string | null;
		catalog?: Catalog;
		join: () => WorkerFullSubject;
	}): WorkerFullSubject;
	inheritCatalog(params: {
		from: SubjectState | null;
		to: SubjectState;
		changes: RowChange[];
	}): void;
};
