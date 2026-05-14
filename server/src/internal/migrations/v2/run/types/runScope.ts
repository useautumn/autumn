/** Resource kind being iterated. Phase 2+ adds catalog-rooted kinds. */
export type RunScopeKind = "customer" | "plan";

/** One iterated item, kind-tagged for generic dispatch. */
export type RunScopeItem = {
	kind: RunScopeKind;
	internal_id: string;
	id: string | null;
};
