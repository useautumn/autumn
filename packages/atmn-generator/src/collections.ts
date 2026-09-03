/**
 * The one per-concept registration the spec cannot express: what a builder is
 * called, what names a row, and which config key holds a collection's history.
 */
export type CollectionMeta = {
	readonly builder: string;
	readonly typeName: string;
	/** Fixture field naming one entry. */
	readonly idField: string;
	/** The same id as catalogV2.get names it. */
	readonly responseIdField: string;
	/** Config key holding past versions; rows there are stamped `active: false`. */
	readonly historyKey?: string;
	/** Whether pull can address entries by `idField` alone. */
	readonly pull: boolean;
};

export const COLLECTIONS: Readonly<Record<string, CollectionMeta>> = {
	features: {
		builder: "feature",
		typeName: "Feature",
		idField: "featureId",
		responseIdField: "id",
		pull: true,
	},
	// Versions share planId: pull matches a stable id first, else id + slug.
	plans: {
		builder: "plan",
		typeName: "Plan",
		idField: "planId",
		responseIdField: "id",
		historyKey: "planVersions",
		pull: true,
	},
};
