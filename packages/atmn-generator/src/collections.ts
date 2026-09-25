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
	/** Rows sharing `idField` are versions; pull keys them by id and slug. */
	readonly versioned?: boolean;
	/** Whether pull can address entries by `idField` alone. */
	readonly pull: boolean;
	/** Set when the item is a union; `builder` then names only the union type. */
	readonly branches?: readonly CollectionBranchMeta[];
};

/**
 * A collection whose item is a union writes one builder per branch: the entry
 * is `{ <key>: body }`, so the id and the fields live one level down.
 */
export type CollectionBranchMeta = {
	readonly builder: string;
	readonly typeName: string;
	/** Fixture key wrapping this branch's body. */
	readonly key: string;
	/** Fixture field naming one entry, branch-rooted. */
	readonly idField: string;
};

export const COLLECTIONS: Readonly<Record<string, CollectionMeta>> = {
	features: {
		builder: "feature",
		typeName: "Feature",
		idField: "featureId",
		responseIdField: "id",
		pull: true,
	},
	// Every version of a plan is a row here; `active` says which one is live.
	plans: {
		builder: "plan",
		typeName: "Plan",
		idField: "planId",
		responseIdField: "id",
		versioned: true,
		pull: true,
	},
	// Free-product and invoice-credit rewards have no branch: the catalog
	// neither states nor touches them.
	rewards: {
		builder: "reward",
		typeName: "Reward",
		idField: "id",
		responseIdField: "id",
		pull: true,
		branches: [
			{ builder: "coupon", typeName: "Coupon", key: "coupon", idField: "id" },
			{
				builder: "featureGrant",
				typeName: "FeatureGrant",
				key: "featureGrant",
				idField: "id",
			},
		],
	},
	referralPrograms: {
		builder: "referralProgram",
		typeName: "ReferralProgram",
		idField: "id",
		responseIdField: "id",
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

/**
 * A list keyed by id that lives outside the catalog: its own preview and sync
 * operations, PATCH semantics (unlisted entries are left alone), and fields a
 * config states once per environment. The item type is read off the sync body.
 */
export type SyncedListMeta = {
	readonly builder: string;
	readonly typeName: string;
	/** Fixture field naming one entry. */
	readonly idField: string;
	/** The operation whose request body declares the item's shape. */
	readonly operationPath: string;
	/** The request-body array holding the items; the config's key is the map key. */
	readonly wireKey: string;
	/** Fields stated per environment as `{ live?, sandbox?, [sandboxSlug]? }`:
	 * push sends the target env's value and skips an entry that has none. */
	readonly envKeyed: readonly string[];
	/** The builder's JSDoc. */
	readonly describe: string;
};

export const SYNCED_LISTS: Readonly<Record<string, SyncedListMeta>> = {
	webhooks: {
		builder: "webhook",
		typeName: "Webhook",
		idField: "id",
		operationPath: "/v1/webhooks.sync",
		wireKey: "webhooks",
		envKeyed: ["url"],
		describe:
			"An Autumn webhook, keyed by `id`. `atmn push` creates or updates it in the target environment and never deletes one; webhooks your config doesn't list are left alone. `url` is a map keyed by environment, so one config registers different URLs in prod and each sandbox, and an environment with no key skips the webhook. A newly created webhook's signing secret is written to your env file as `AUTUMN_WEBHOOK_<ID>_SECRET` (prod, in `.env.prod`) or `AUTUMN_WEBHOOK_<ID>_<ORG4>_SECRET` (sandboxes).",
	},
};
