/**
 * CLI-shaped differences from the API live here, in one declarative file, and
 * nowhere else. The spec stays the single source of truth for SHAPE; the
 * overlay only says what the CLI does with a field the API already describes.
 *
 * Three verbs, deliberately. Anything needing a fourth is a sign the difference
 * belongs in the schema or the server instead — that is the project's mantra.
 *
 * Entries are expected to stay few. Casing is NOT a rename: `version_slug`
 * becomes `versionSlug` by the generic mapper, so it needs no entry.
 */

/** Dotted path from a collection item root, e.g. "items.price.billing_units". */
export type FieldPath = string;

export type FieldOverlay = {
	/** Keep it out of fixtures, builders and emitters entirely. */
	hidden?: true;
	/** Use this fixture name instead of the recased one. */
	rename?: string;
	/** Required in the config even though the API accepts it as optional. */
	required?: true;
	/** Kept for existing catalogs only: struck through in editors, and push
	 * warns when a config still states it. */
	deprecated?: true;
	/** Why — this is documentation, and it is not optional. */
	reason: string;
};

export type CollectionOverlay = Record<FieldPath, FieldOverlay>;

export type Overlay = {
	/** Keyed by top-level wire collection: "features", "plans", … */
	collections: Record<string, CollectionOverlay>;
	/** Wire names allowed through despite `x-internal` — the ids the CLI must carry. */
	exposeInternal: string[];
};

/**
 * Entries land with the concept they belong to, never ahead of it — an entry
 * for a fixture that does not exist yet is a guess at a path.
 */
export const OVERLAY: Overlay = {
	exposeInternal: ["internal_id", "entity_feature_id"],
	collections: {
		plans: {
			"licenses.version_slug": {
				hidden: true,
				reason:
					"A link always follows the child's active version (wire/07_licenses); pinning it from config is a change the server reports forever.",
			},
			name: {
				required: true,
				reason:
					"A fixture states the whole row (PUT), so a plan always has its name.",
			},
			new_plan_id: {
				hidden: true,
				reason:
					"A push-time input. A changed planId beside internalId is the rename.",
			},
			new_version_slug: {
				hidden: true,
				reason:
					"A push-time input. A changed versionSlug beside internalId is the rename.",
			},
			"variants.new_plan_id": {
				hidden: true,
				reason:
					"A push-time input. A changed variantPlanId beside internalId is the rename.",
			},
			"items.entity_feature_id": {
				deprecated: true,
				reason:
					"Per-entity items are deprecated but existing catalogs carry them, so a config must keep round-tripping the field.",
			},
			versioning: {
				hidden: true,
				reason:
					"A decision. The server derives it from the rows (01_wire rule 6).",
			},
			propagate: {
				hidden: true,
				reason:
					"A decision. The server derives it from the rows (01_wire rule 6).",
			},
			migration: {
				hidden: true,
				reason:
					"Per-plan form is dashboard-only; atmn sends the request-level constant.",
			},
			version: {
				hidden: true,
				reason: "Deprecated by the spec itself: version_slug targets a row.",
			},
		},
		features: {
			new_feature_id: {
				hidden: true,
				reason:
					"Dead since internal_id: a changed featureId beside it is the rename.",
			},
			invoice_credit: {
				hidden: true,
				reason:
					"Admin-only for now: invoice credits are money, and a config must not mint them.",
			},
			name: {
				required: true,
				reason:
					"A fixture states the whole row (PUT), so a feature always has its name.",
			},
			event_names: {
				deprecated: true,
				reason:
					"Deprecated on the server, but existing catalogs carry it, so a config must keep round-tripping the field.",
			},
		},
	},
};

export const fieldOverlay = ({
	overlay,
	collection,
	path,
}: {
	overlay: Overlay;
	collection: string;
	path: FieldPath;
}): FieldOverlay | undefined => overlay.collections[collection]?.[path];

export const isHidden = ({
	overlay,
	collection,
	path,
}: {
	overlay: Overlay;
	collection: string;
	path: FieldPath;
}): boolean => fieldOverlay({ overlay, collection, path })?.hidden === true;

/** The overlay's rename wins; otherwise the generic recasing stands. */
export const fixtureNameFor = ({
	overlay,
	collection,
	path,
	recased,
}: {
	overlay: Overlay;
	collection: string;
	path: FieldPath;
	recased: string;
}): string => fieldOverlay({ overlay, collection, path })?.rename ?? recased;

export const isDeprecatedByOverlay = ({
	overlay,
	collection,
	path,
}: {
	overlay: Overlay;
	collection: string;
	path: FieldPath;
}): boolean => fieldOverlay({ overlay, collection, path })?.deprecated === true;

/** Every deprecated field of a collection, wire-named and item-rooted, with its reason. */
export const deprecatedFieldsOf = ({
	overlay,
	collection,
}: {
	overlay: Overlay;
	collection: string;
}): { path: FieldPath; reason: string }[] =>
	Object.entries(overlay.collections[collection] ?? {}).flatMap(
		([path, field]) =>
			field.deprecated === true ? [{ path, reason: field.reason }] : [],
	);

export const isRequiredByOverlay = ({
	overlay,
	collection,
	path,
}: {
	overlay: Overlay;
	collection: string;
	path: FieldPath;
}): boolean => fieldOverlay({ overlay, collection, path })?.required === true;

/** Server-owned unless the overlay names it: `x-internal` is opt-out, so a new
 * internal field can never leak into a fixture by default. */
export const isInternalField = ({
	overlay,
	wireKey,
	schema,
}: {
	overlay: Overlay;
	wireKey: string;
	schema: JsonSchemaLike;
}): boolean =>
	schema["x-internal"] === true && !overlay.exposeInternal.includes(wireKey);

type JsonSchemaLike = { [key: string]: unknown };
