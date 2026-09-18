/** One row's move, as the committer hands it over. A set replaces columns and is refused when the guard no longer holds; an add moves counters on whatever the row holds now. Mirrors the engine's update and increment changes. */
export type SubjectRowUpdate =
	| {
			kind: "set";
			table: SubjectRowTable;
			id: string;
			set: Record<string, unknown>;
			guard: Record<string, unknown>;
	  }
	| {
			kind: "add";
			table: SubjectRowTable;
			id: string;
			/** Top-level counters, added to the stored value. */
			add: Record<string, number>;
			/** Counters inside a jsonb map, by entry key then field, added to the stored entry. */
			addEntries: Record<string, Record<string, Record<string, number>>>;
			/** Shape columns the row must still hold for the add to mean anything. */
			guard: Record<string, unknown>;
	  };

export type SubjectRowTable =
	| "customerEntitlements"
	| "rollovers"
	| "usageWindows";
