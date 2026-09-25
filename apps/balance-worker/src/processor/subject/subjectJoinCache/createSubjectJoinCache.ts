import type {
	Catalog,
	SubjectState,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import type {
	SubjectJoin,
	SubjectJoinCache,
} from "./types/subjectJoinCache.js";

/** A join is pure over (state, catalog) and states are replaced, never edited, so one join per state serves every read until the catalog moves. */
export const createSubjectJoinCache = ({
	ctx,
}: {
	ctx: { catalogCache: Pick<CatalogCache, "changeCount"> };
}): SubjectJoinCache => {
	const joins = new WeakMap<SubjectState, SubjectJoin>();

	function joinOf({ state }: { state: SubjectState }): SubjectJoin {
		const catalogChangeCount = ctx.catalogCache.changeCount();
		const existing = joins.get(state);
		if (existing?.catalogChangeCount === catalogChangeCount) return existing;
		const join: SubjectJoin = {
			catalogChangeCount,
			catalog: null,
			fullSubjectByEntityId: new Map(),
		};
		joins.set(state, join);
		return join;
	}

	function peekCatalog({ state }: { state: SubjectState }): Catalog | null {
		const existing = joins.get(state);
		if (existing?.catalogChangeCount !== ctx.catalogCache.changeCount())
			return null;
		return existing.catalog;
	}
	function readCatalog({
		state,
		join,
	}: {
		state: SubjectState;
		join: () => Catalog;
	}): Catalog {
		const cached = joinOf({ state });
		cached.catalog ??= join();
		return cached.catalog;
	}

	function readFullSubject({
		state,
		entityId,
		join,
	}: {
		state: SubjectState;
		entityId: string | null;
		join: () => WorkerFullSubject;
	}): WorkerFullSubject {
		const cached = joinOf({ state });
		const existing = cached.fullSubjectByEntityId.get(entityId);
		if (existing) return existing;
		const fullSubject = join();
		cached.fullSubjectByEntityId.set(entityId, fullSubject);
		return fullSubject;
	}

	return { peekCatalog, readCatalog, readFullSubject };
};
