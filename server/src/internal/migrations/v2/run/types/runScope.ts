export type RunScopeKind = "customer" | "plan";

export type RunScopeItem = {
	kind: RunScopeKind;
	internal_id: string;
	id: string | null;
};
