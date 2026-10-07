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

/** A join is pure over (state, catalog) and states are replaced, never edited, so one join per state serves every read until its own catalog rows move. */
export const createSubjectJoinCache = ({
	ctx,
}: {
	ctx: {
		catalogCache: Pick<CatalogCache, "isCurrent">;
		/** How long a joined catalog is trusted before `ensure` re-reads its rows; bounds staleness across inherited states. */
		config: { catalogRecheckMs: number };
		now?: () => number;
	};
}): SubjectJoinCache => {
	const joins = new WeakMap<SubjectState, SubjectJoin>();
	const now = ctx.now ?? Date.now;

	/** Built against no catalog yet, or one whose rows haven't moved: another customer's rows coming and going don't count. */
	function isJoinCurrent(join: SubjectJoin): boolean {
		return (
			join.basis === null || ctx.catalogCache.isCurrent({ catalog: join.basis })
		);
	}

	function joinOf({ state }: { state: SubjectState }): SubjectJoin {
		const existing = joins.get(state);
		if (existing && isJoinCurrent(existing)) return existing;
		const join: SubjectJoin = {
			basis: null,
			catalog: null,
			catalogJoinedAt: null,
			fullSubjectByEntityId: new Map(),
		};
		joins.set(state, join);
		return join;
	}

	function isRecheckDue(join: SubjectJoin): boolean {
		return (
			join.catalogJoinedAt === null ||
			now() - join.catalogJoinedAt >= ctx.config.catalogRecheckMs
		);
	}

	/** Joined, its rows unmoved, and not yet due a recheck. */
	function isCatalogCurrent(
		join: SubjectJoin | undefined,
	): join is JoinedCatalog {
		if (!join || join.catalog === null || join.catalogJoinedAt === null)
			return false;
		return isJoinCurrent(join) && !isRecheckDue(join);
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
		// A catalog past its recheck is joined again from the rows `ensure` just refreshed; keeping it
		// would leave this state, and every state it hands the catalog on to, due forever.
		if (cached.catalog === null || isRecheckDue(cached)) {
			cached.catalog = join();
			cached.catalogJoinedAt = now();
			cached.basis ??= cached.catalog;
		}
		return cached.catalog;
	}

	function readFullSubject({
		state,
		entityId,
		catalog,
		join,
	}: {
		state: SubjectState;
		entityId: string | null;
		/** The catalog `join` reads, when the caller already holds it. */
		catalog?: Catalog;
		join: () => WorkerFullSubject;
	}): WorkerFullSubject {
		const cached = joinOf({ state });
		const existing = cached.fullSubjectByEntityId.get(entityId);
		if (existing) return existing;
		const fullSubject = join();
		cached.basis ??= catalog ?? cached.catalog;
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
		// The decision already joined the next state's view against this catalog; it keeps that and gains the catalog.
		const existing = joins.get(to);
		if (
			existing &&
			(existing.basis === null || existing.basis === join.catalog)
		) {
			existing.basis = join.catalog;
			if (existing.catalog === null) {
				existing.catalog = join.catalog;
				existing.catalogJoinedAt = join.catalogJoinedAt;
			}
			return;
		}
		joins.set(to, {
			basis: join.catalog,
			catalog: join.catalog,
			catalogJoinedAt: join.catalogJoinedAt,
			fullSubjectByEntityId: new Map(),
		});
	}

	return { peekCatalog, readCatalog, readFullSubject, inheritCatalog };
};
