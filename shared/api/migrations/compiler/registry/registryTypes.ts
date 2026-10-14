export type AmbientPredicate = {
	column: string;
	source:
		| { kind: "context"; key: string }
		| { kind: "values"; values: readonly (string | number)[] };
};

export type LeafField = {
	kind: "leaf";
	sql: string;
};

export type NavScope = {
	from: string;
	correlation: string;
	ambient?: AmbientPredicate[];
	fields: Record<string, FieldDef>;
};

export type NavField = {
	kind: "nav";
	scope: NavScope;
};

export type FieldDef = LeafField | NavField;

export type RootScope = {
	from: string;
	ambient?: AmbientPredicate[];
	fields: Record<string, FieldDef>;
};
