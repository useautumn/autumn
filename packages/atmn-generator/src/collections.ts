export type CollectionMeta = {
	readonly builder: string;
	readonly typeName: string;
	readonly idField: string;
	readonly responseIdField: string;
	readonly versioned?: boolean;
	readonly pull: boolean;
	readonly branches?: readonly CollectionBranchMeta[];
};

export type CollectionBranchMeta = {
	readonly builder: string;
	readonly typeName: string;
	readonly key: string;
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
	plans: {
		builder: "plan",
		typeName: "Plan",
		idField: "planId",
		responseIdField: "id",
		versioned: true,
		pull: true,
	},
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

export type NestedFixtureMeta = {
	readonly builder: string;
	readonly typeName: string;
	readonly idField: string;
	readonly parent: string;
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

export type SingletonMeta = {
	readonly typeName: string;
	readonly operationPath: string;
	readonly wireKey: string;
};

export const SINGLETONS: Readonly<Record<string, SingletonMeta>> = {
	settings: {
		typeName: "Settings",
		operationPath: "/v1/organization.update",
		wireKey: "config",
	},
};

export type SyncedListMeta = {
	readonly builder: string;
	readonly typeName: string;
	readonly idField: string;
	readonly operationPath: string;
	readonly wireKey: string;
	readonly envField: string;
	readonly openEnums: readonly string[];
	readonly describe: string;
};

export const SYNCED_LISTS: Readonly<Record<string, SyncedListMeta>> = {
	webhooks: {
		builder: "webhook",
		typeName: "Webhook",
		idField: "id",
		operationPath: "/v1/webhooks.sync",
		wireKey: "webhooks",
		envField: "env",
		openEnums: ["events"],
		describe:
			"One Autumn webhook endpoint in one environment, keyed by `env` and `id`. `atmn push --yes` creates or updates it, and deletes the endpoints your config no longer lists in each environment it syncs; the preview shows each delete first. Register a webhook in several environments with one `webhook()` per environment; the same `id` may repeat across them. A newly created webhook's signing secret is written to your env file as `AUTUMN_WEBHOOK_<ID>_SECRET` (prod, in `.env.prod`) or `AUTUMN_WEBHOOK_<ID>_<SANDBOX_SLUG>_SECRET` (sandboxes; `SANDBOX` for the default one).",
	},
};
