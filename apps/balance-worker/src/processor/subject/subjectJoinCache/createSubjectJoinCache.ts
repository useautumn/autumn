import {
	type Catalog,
	changesKeepCatalogKeys,
	type RowChange,
	type SubjectState,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import type {
	SubjectJoin,
	SubjectJoinCache,
} from "./types/subjectJoinCache.js";

type JoinedCatalog = SubjectJoin & {
	catalog: Catalog;
	catalogJoinedAt: number;
};

/** A join is pure over (state, catalog) and states are replaced, never edited, so one join per state serves every read until the catalog moves. */
export const createSubjectJoinCache = ({
	ctx,
}: {
	ctx: {
		catalogCache: Pick<CatalogCache, "changeCount">;
		/** How long a joined catalog is trusted before `ensure` re-reads its rows; bounds staleness across inherited states. */
		config: { catalogRecheckMs: number };
		now?: () => number;
	};
}): SubjectJoinCache => {
	const joins = new WeakMap<SubjectState, SubjectJoin>();
	const now = ctx.now ?? Date.now;

	function joinOf({ state }: { state: SubjectState }): SubjectJoin {
		const catalogChangeCount = ctx.catalogCache.changeCount();
		const existing = joins.get(state);
		if (existing?.catalogChangeCount === catalogChangeCount) return existing;
		const join: SubjectJoin = {
			catalogChangeCount,
			catalog: null,
			catalogJoinedAt: null,
			fullSubjectByEntityId: new Map(),
		};
		joins.set(state, join);
		return join;
	}

	/** Joined, at the catalog's current change count, and not yet due a recheck. */
	function isCatalogCurrent(
		join: SubjectJoin | undefined,
	): join is JoinedCatalog {
		if (!join || join.catalog === null || join.catalogJoinedAt === null)
			return false;
		return (
			join.catalogChangeCount === ctx.catalogCache.changeCount() &&
			now() - join.catalogJoinedAt < ctx.config.catalogRecheckMs
		);
	}

	function peekCatalog({ state }: { state: SubjectState }): Catalog | null {
		const join = joins.get(state);
		return isCatalogCurrent(join) ? join.catalog : null;
	}

	function readCatalog({
		state,
		join,
	}: {
		state: SubjectState;
		join: () => Catalog;
	}): Catalog {
		const cached = joinOf({ state });
		if (cached.catalog === null) {
			cached.catalog = join();
			cached.catalogJoinedAt = now();
		}
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

	function inheritCatalog({
		from,
		to,
		changes,
	}: {
		from: SubjectState | null;
		to: SubjectState;
		changes: RowChange[];
	}): void {
		if (!from || !changesKeepCatalogKeys({ changes })) return;
		const join = joins.get(from);
		if (!isCatalogCurrent(join)) return;
		joins.set(to, {
			catalogChangeCount: join.catalogChangeCount,
			catalog: join.catalog,
			catalogJoinedAt: join.catalogJoinedAt,
			fullSubjectByEntityId: new Map(),
		});
	}

	return { peekCatalog, readCatalog, readFullSubject, inheritCatalog };
};
