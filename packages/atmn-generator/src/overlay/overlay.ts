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
	/** Why — this is documentation, and it is not optional. */
	reason: string;
};

export type CollectionOverlay = Record<FieldPath, FieldOverlay>;

export type Overlay = {
	/** Keyed by top-level wire collection: "features", "plans", … */
	collections: Record<string, CollectionOverlay>;
};

/**
 * Empty on purpose. The entries this will grow — `event_names` hidden,
 * `purchase_limit.count` hidden, `version_slug` required — belong to concepts
 * that are not built yet, and adding them before their fixtures exist would be
 * guessing at paths.
 */
export const OVERLAY: Overlay = {
	collections: {},
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

export const isRequiredByOverlay = ({
	overlay,
	collection,
	path,
}: {
	overlay: Overlay;
	collection: string;
	path: FieldPath;
}): boolean => fieldOverlay({ overlay, collection, path })?.required === true;
