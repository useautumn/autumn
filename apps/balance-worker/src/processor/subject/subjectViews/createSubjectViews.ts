import type {
	Catalog,
	SubjectState,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { SubjectView, SubjectViews } from "./types/subjectViews.js";

/** A join is pure over (state, catalog) and states are replaced, never edited, so one join per state serves every read until the catalog moves. */
export const createSubjectViews = ({
	ctx,
}: {
	ctx: { catalogCache: Pick<CatalogCache, "revision"> };
}): SubjectViews => {
	const views = new WeakMap<SubjectState, SubjectView>();

	function viewOf({ state }: { state: SubjectState }): SubjectView {
		const catalogRevision = ctx.catalogCache.revision();
		const existing = views.get(state);
		if (existing?.catalogRevision === catalogRevision) return existing;
		const view: SubjectView = {
			catalogRevision,
			catalog: null,
			fullSubjectByEntityId: new Map(),
		};
		views.set(state, view);
		return view;
	}

	function readCatalog({
		state,
		join,
	}: {
		state: SubjectState;
		join: () => Catalog;
	}): Catalog {
		const view = viewOf({ state });
		view.catalog ??= join();
		return view.catalog;
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
		const view = viewOf({ state });
		const existing = view.fullSubjectByEntityId.get(entityId);
		if (existing) return existing;
		const fullSubject = join();
		view.fullSubjectByEntityId.set(entityId, fullSubject);
		return fullSubject;
	}

	return { readCatalog, readFullSubject };
};
