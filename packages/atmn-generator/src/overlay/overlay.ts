/** The overlay holds CLI-only field treatment while OpenAPI owns shape; `default` omits values the server reads identically.
 * Casing is generic, so `version_slug` becomes `versionSlug` without an entry. */

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
	/** A sentence appended to the field's JSDoc: what the server's description
	 * leaves out and a reader (or an agent) needs to know in the config. */
	describe?: string;
	/** The value the CLI treats as this field's default: a field at it is not written into a fixture. */
	default?: unknown;
	/** Why — this is documentation, and it is not optional. */
	reason: string;
};

export type CollectionOverlay = Record<FieldPath, FieldOverlay>;

export type Overlay = {
	/** Keyed by top-level wire collection: "features", "plans", … */
	collections: Record<string, CollectionOverlay>;
	/** Wire names allowed through despite `x-internal` — the ids the CLI must carry. */
	exposeInternal: string[];
	/**
	 * Test-only bookkeeping; changes no generated output. `x-internal` fields
	 * the server both returns and accepts are already dropped from fixtures,
	 * and each is named here with why that is a no-op on push; an unnamed one
	 * fails the generator's round-trip guard.
	 */
	serverOwnedInternal: Record<string, string>;
};

/**
 * Entries land with the concept they belong to, never ahead of it — an entry
 * for a fixture that does not exist yet is a guess at a path.
 */
export const OVERLAY: Overlay = {
	exposeInternal: ["internal_id", "entity_feature_id", "allocated_billing"],
	serverOwnedInternal: {
		price_id: "Row id; the server matches the price by feature and reuses it.",
		entitlement_id:
			"Row id; the server matches the entitlement by feature and reuses it.",
		stripe_price_id:
			"Processor mapping; carried by `processors.stripe.priceId` when stated.",
		base_currency:
			"FX bookkeeping written beside `currencies`; derived from the org's default.",
		update_items:
			"A patch lane on a variant; a fixture states the variant's full items instead.",
	},
	collections: {
		plans: {
			"items.unlimited": {
				default: false,
				reason:
					"The server reads absent and false identically, so writing false adds noise to pulled fixtures.",
			},
			"items.proration": {
				default: {
					onIncrease: "prorate_immediately",
					onDecrease: "prorate_immediately",
				},
				reason:
					"The pair the server stores for a prepaid item that never set one, and what it reads an omitted block as, so a pull writes proration only when it was set to something else.",
			},
			"licenses.customize.add_items.proration": {
				default: {
					onIncrease: "prorate_immediately",
					onDecrease: "prorate_immediately",
				},
				reason:
					"The pair the server stores for a prepaid item that never set one, and what it reads an omitted block as, so a pull writes proration only when it was set to something else.",
			},
			"variants.customize.items.proration": {
				default: {
					onIncrease: "prorate_immediately",
					onDecrease: "prorate_immediately",
				},
				reason:
					"The pair the server stores for a prepaid item that never set one, and what it reads an omitted block as, so a pull writes proration only when it was set to something else.",
			},
			"variants.customize.add_items.proration": {
				default: {
					onIncrease: "prorate_immediately",
					onDecrease: "prorate_immediately",
				},
				reason:
					"The pair the server stores for a prepaid item that never set one, and what it reads an omitted block as, so a pull writes proration only when it was set to something else.",
			},
			"variants.customize.upsert_licenses.customize.add_items.proration": {
				default: {
					onIncrease: "prorate_immediately",
					onDecrease: "prorate_immediately",
				},
				reason:
					"The pair the server stores for a prepaid item that never set one, and what it reads an omitted block as, so a pull writes proration only when it was set to something else.",
			},
			"licenses.customize.add_items.unlimited": {
				default: false,
				reason:
					"The server reads absent and false identically, so writing false adds noise to pulled fixtures.",
			},
			"variants.customize.items.unlimited": {
				default: false,
				reason:
					"The server reads absent and false identically, so writing false adds noise to pulled fixtures.",
			},
			"variants.customize.add_items.unlimited": {
				default: false,
				reason:
					"The server reads absent and false identically, so writing false adds noise to pulled fixtures.",
			},
			"variants.customize.upsert_licenses.customize.add_items.unlimited": {
				default: false,
				reason:
					"The server reads absent and false identically, so writing false adds noise to pulled fixtures.",
			},
			version_slug: {
				describe:
					'Defaults to "vN", N being the server\'s version number, which counts in creation order; state it explicitly on every history row so a nuke-and-repush or a sandbox-to-prod push keeps the same names even though the numbers may differ.',
				reason:
					"The number is not shown in the config, only the slug, and the default ties the two together.",
			},
			"variants.version_slug": {
				describe:
					'Defaults to "vN", N being the server\'s version number; state it explicitly on every variant history row.',
				reason: "Same default as the base plan's versionSlug.",
			},
			"licenses.version_slug": {
				reason:
					"A catalog fixture must identify the exact child row so the same config links the same version in every environment.",
			},
			"variants.customize.upsert_licenses.version_slug": {
				reason:
					"Customized variant license links use the same explicit child-version anchor as top-level plan licenses.",
			},
			name: {
				required: true,
				reason:
					"A fixture states the whole row (PUT), so a plan always has its name.",
			},
			active: {
				required: true,
				reason:
					"With every version in one array, membership no longer says which row is live; each row has to.",
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
			"variants.name": {
				required: true,
				reason:
					"A variant fixture states the whole row like a plan does; the server only demands the name on create because a declared entry doubles as a follow reference.",
			},
			"variants.new_plan_id": {
				hidden: true,
				reason:
					"A push-time input. A changed variantPlanId beside internalId is the rename.",
			},
			base_variant_id: {
				hidden: true,
				reason:
					"A link instruction the server resolves into its internal base pointer, but the pulled value is the legacy monthly/annual grouping id, so a pull-then-push would invent a variant link. Membership in a base's variants[] is the only way a config states the relationship.",
			},
			"variants.base_variant_id": {
				hidden: true,
				reason:
					"A push-time unlink (`null`); removing the entry from variants[] already unlinks. Omitted, the server leaves the pointer to the declaring base.",
			},
			"items.entity_feature_id": {
				deprecated: true,
				reason:
					"Per-entity items are deprecated but existing catalogs carry them, so a config must keep round-tripping the field.",
			},
			"items.price.allocated_billing": {
				describe:
					"Only pulled as `prorated_legacy` for a price still on the legacy immediate-proration behavior, alongside its `proration` knobs.",
				reason:
					"The server only surfaces the legacy value, so a config carrying it must round-trip; dropping it is the migration.",
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
			is_default: {
				hidden: true,
				reason:
					"The deprecated twin of auto_enable: both write the same flag, and a config states it once.",
			},
		},
		features: {
			display: {
				hidden: true,
				reason:
					"Generated on the server from the name; a config neither states nor pulls it.",
			},
			new_feature_id: {
				hidden: true,
				reason:
					"Dead since internal_id: a changed featureId beside it is the rename.",
			},
			name: {
				required: true,
				reason:
					"A fixture states the whole row (PUT), so a feature always has its name.",
			},
		},
		settings: {
			persist_free_overage: {
				rename: "paydownOverages",
				reason:
					"The flag's effect is that resets and top-ups pay down unbilled overages; the wire name describes the mechanism, not the outcome.",
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

export const describeByOverlay = ({
	overlay,
	collection,
	path,
}: {
	overlay: Overlay;
	collection: string;
	path: FieldPath;
}): string | undefined => fieldOverlay({ overlay, collection, path })?.describe;

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

/** CLI wording where the shared label reads wrong at the terminal. */
export const LABEL_OVERLAY: Record<string, string> = {
	processors: "Processor mappings",
	id: "ID",
};
