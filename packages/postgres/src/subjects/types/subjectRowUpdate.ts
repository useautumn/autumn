/**
 * One row's move, as the committer hands it over. `set` replaces columns, `add` moves counters on
 * whatever the row holds, `addEntries` moves counters inside a jsonb map, `guard` names columns the row
 * must still hold. A row appears once per flush: folding merges every change to it into one of these.
 */
export type SubjectRowUpdate = {
	table: SubjectRowTable;
	id: string;
	set: Record<string, unknown>;
	add: Record<string, number>;
	addEntries: Record<string, Record<string, Record<string, number>>>;
	guard: Record<string, unknown>;
};

export type SubjectRowTable =
	| "customerEntitlements"
	| "rollovers"
	| "usageWindows";
