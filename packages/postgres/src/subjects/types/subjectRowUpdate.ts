export type SubjectRowUpdate = {
	table: SubjectRowTable;
	id: string;
	set: Record<string, unknown>;
	add: Record<string, number>;
	addEntries: Record<string, Record<string, Record<string, number>>>;
	guard: Record<string, unknown>;
};

export type SubjectRowTable =
	| "customers"
	| "entities"
	| "customerProducts"
	| "customerPrices"
	| "customerEntitlements"
	| "rollovers"
	| "usageWindows"
	| "pooledBalances"
	| "pooledContributions"
	| "locks";
