import type {
	Catalog,
	RowChange,
	SubjectState,
	WorkerFullSubject,
} from "@autumn/balance-engine";

/** What one state was joined into, against one catalog read. */
export type SubjectJoin = {
	/** The catalog everything here was built from; the join holds while the catalog cache says it is current. */
	basis: Catalog | null;
	catalog: Catalog | null;
	/** When the catalog was joined; trusted from then for `catalogRecheckMs`, across the states it carries to. */
	catalogJoinedAt: number | null;
	fullSubjectByEntityId: Map<string | null, WorkerFullSubject>;
};

/** Each state's joins, kept until the state is replaced or its catalog's rows move. */
export type SubjectJoinCache = {
	/** The catalog joined for this state while its rows are unmoved and within its recheck, or null. */
	peekCatalog(params: { state: SubjectState }): Catalog | null;
	readCatalog(params: { state: SubjectState; join: () => Catalog }): Catalog;
	readFullSubject(params: {
		state: SubjectState;
		entityId: string | null;
		catalog?: Catalog;
		join: () => WorkerFullSubject;
	}): WorkerFullSubject;
	/** A state advanced by `changes` that keep its catalog keys: the next state starts with the same joined catalog. */
	inheritCatalog(params: {
		from: SubjectState | null;
		to: SubjectState;
		changes: RowChange[];
	}): void;
};
