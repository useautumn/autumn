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

/**
 * Fixtures that live inside a collection item rather than at the top level:
 * a builder so they can be written in their own file and placed into the
 * parent's array. The wire is unchanged; the builder is an identity.
 */
export type NestedFixtureMeta = {
	readonly builder: string;
	readonly typeName: string;
	/** Fixture field naming one entry. */
	readonly idField: string;
	/** The top-level collection holding the parent item. */
	readonly parent: string;
	/** The array field on the parent item, item-rooted (overlay paths hang off it). */
	readonly path: string;
};

export const NESTED_FIXTURES: Readonly<Record<string, NestedFixtureMeta>> = {
	variants: {
		builder: "variant",
		typeName: "Variant",
		idField: "variantPlanId",
		parent: "plans",
		path: "variants",
	},
	licenses: {
		builder: "license",
		typeName: "License",
		idField: "licensePlanId",
		parent: "plans",
		path: "licenses",
	},
};

/**
 * A singleton is one object on the config, not a list of rows: no id, no
 * history, and its wire semantics are PATCH — a stated field is written, an
 * omitted one is left alone. The type is read off the operation's body.
 */
export type SingletonMeta = {
	readonly typeName: string;
	/** The operation whose request body declares the singleton's shape. */
	readonly operationPath: string;
	/** The request-body field holding the object; the config's key is the map key. */
	readonly wireKey: string;
};

export const SINGLETONS: Readonly<Record<string, SingletonMeta>> = {
	settings: {
		typeName: "Settings",
		operationPath: "/v1/organization.update",
		wireKey: "config",
	},
};
