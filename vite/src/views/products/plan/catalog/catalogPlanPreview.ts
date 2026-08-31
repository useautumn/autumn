import type {
	CatalogConflictPreview,
	CatalogLicenseParentPreview,
	CatalogLicenseParentVersionPreview,
	CatalogPlanUpdatePreview,
	CatalogPlanVersioningStrategy,
	CatalogPropagateParams,
	CatalogVariantPreview,
	CatalogVariantVersionPreview,
	PlanAliasReplacement,
	PlanChangeV0,
	PlanItemChangeV0,
	PlanLicenseChangeV0,
	PreviewUpdateCatalogResponse,
} from "@autumn/shared";
import {
	planScopeIncludesVersion,
	planScopeIsWholePlan,
} from "@/components/plans/planScopeSelection";
import { makePlanKey, parsePlanKey } from "@/lib/planSelectionKeys";
import {
	previousAttributesToSettingChanges,
	type SettingChange,
} from "../versioning/PlanSettingsChanges";

export type CatalogVersionChoice = "new" | "update" | "all";

export const versionChoiceToStrategy = ({
	choice,
}: {
	choice: CatalogVersionChoice;
}): CatalogPlanVersioningStrategy | undefined => {
	if (choice === "new") return "new_version";
	if (choice === "all") return "all_versions";
	return undefined;
};

export const previewOpensStrategyStep = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): boolean => (preview?.versioning?.options.length ?? 0) > 0;

export const catalogPreviewAliasReplacements = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): PlanAliasReplacement[] => {
	if (!preview) return [];
	const replacements: PlanAliasReplacement[] = [];
	if (preview.alias_replacement) replacements.push(preview.alias_replacement);
	for (const variant of preview.variants ?? []) {
		if (variant.alias_replacement) replacements.push(variant.alias_replacement);
	}
	return replacements;
};

export const catalogPreviewHasAliasReplacement = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): boolean => catalogPreviewAliasReplacements({ preview }).length > 0;

export const isCatalogMetadataOnly = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): boolean =>
	!!preview &&
	!preview.plan_change?.customize &&
	(preview.plan_change?.license_changes?.length ?? 0) === 0;

export const catalogPreviewHasPlanIdChange = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): boolean =>
	typeof preview?.plan_change?.previous_attributes?.id === "string";

export const catalogPreviewHasPromotion = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): boolean => Boolean(preview?.promotion_details);

export const catalogPreviewPlanIdChange = ({
	preview,
	nextPlanId,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
	nextPlanId?: string;
}): { from: string; to: string } | undefined => {
	const from = preview?.plan_change?.previous_attributes?.id;
	if (typeof from !== "string" || !nextPlanId || from === nextPlanId) {
		return undefined;
	}
	return { from, to: nextPlanId };
};

/** The server reports a slug rename on the row identity, not in previous_attributes. */
export const catalogPreviewVersionSlugChange = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): { from: string; to: string } | undefined => {
	const to = preview?.new_version_slug;
	if (!to || !preview?.version_slug) return undefined;
	return { from: preview.version_slug, to };
};

export const catalogPreviewHasVersionSlugChange = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): boolean => catalogPreviewVersionSlugChange({ preview }) !== undefined;

const parentVersionsOf = ({
	parent,
}: {
	parent: CatalogLicenseParentPreview;
}): CatalogLicenseParentVersionPreview[] => {
	const { sibling_versions: _siblings, ...row } = parent;
	return [row, ...(parent.sibling_versions ?? [])];
};

/** Fold parent versions into one lane per plan. Sibling-linked rows are
 * parents anchored to another child version — omit them on `existing`. */
export const catalogPlanLicenseParents = ({
	preview,
	includeSiblingLinked = true,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
	includeSiblingLinked?: boolean;
}): CatalogLicenseParentPreview[] => {
	if (!preview) return [];
	const byPlanId = new Map<
		string,
		{ name: string; versions: Map<number, CatalogLicenseParentVersionPreview> }
	>();

	const ingest = (parent: CatalogLicenseParentPreview) => {
		const existing = byPlanId.get(parent.plan_id) ?? {
			name: parent.name,
			versions: new Map(),
		};
		existing.name = parent.name;
		for (const version of parentVersionsOf({ parent })) {
			existing.versions.set(version.version, version);
		}
		byPlanId.set(parent.plan_id, existing);
	};

	if (includeSiblingLinked) {
		for (const sibling of preview.sibling_versions ?? []) {
			for (const parent of sibling.license_parents ?? []) ingest(parent);
		}
	}
	for (const parent of preview.license_parents ?? []) ingest(parent);

	return [...byPlanId.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, { name, versions }]) => {
			const newestFirst = [...versions.values()].sort(
				(left, right) => right.version - left.version,
			);
			const [top, ...siblings] = newestFirst;
			return {
				...top,
				name,
				...(siblings.length > 0 ? { sibling_versions: siblings } : {}),
			};
		});
};

const variantVersionsOf = ({
	variant,
}: {
	variant: CatalogVariantPreview;
}): CatalogVariantVersionPreview[] => {
	const { sibling_versions: _siblings, ...row } = variant;
	return [row, ...(variant.sibling_versions ?? [])];
};

/** Variant lanes offered for an edit: the edited row's own, plus each
 * sibling base row's when the edit spans all versions. One lane per plan. */
export const catalogPlanVariantLanes = ({
	preview,
	includeSiblingRows = true,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
	includeSiblingRows?: boolean;
}): CatalogVariantPreview[] => {
	if (!preview) return [];
	const byPlanId = new Map<string, Map<number, CatalogVariantVersionPreview>>();

	const ingest = (variant: CatalogVariantPreview) => {
		const versions = byPlanId.get(variant.plan_id) ?? new Map();
		for (const row of variantVersionsOf({ variant })) {
			versions.set(row.version, row);
		}
		byPlanId.set(variant.plan_id, versions);
	};

	if (includeSiblingRows) {
		for (const sibling of preview.sibling_versions ?? []) {
			for (const variant of sibling.variants ?? []) ingest(variant);
		}
	}
	for (const variant of preview.variants ?? []) ingest(variant);

	return [...byPlanId.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, versions]) => {
			const newestFirst = [...versions.values()].sort(
				(left, right) => right.version - left.version,
			);
			const [top, ...siblings] = newestFirst;
			return {
				...top,
				...(siblings.length > 0 ? { sibling_versions: siblings } : {}),
			};
		});
};

export const catalogPreviewOpensDialog = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): boolean => {
	if (catalogPreviewHasPromotion({ preview })) return true;
	if (catalogPreviewHasAliasReplacement({ preview })) return true;
	if (isCatalogMetadataOnly({ preview })) {
		return (
			catalogPreviewHasPlanIdChange({ preview }) ||
			catalogPreviewHasVersionSlugChange({ preview })
		);
	}
	return (
		previewOpensStrategyStep({ preview }) ||
		(preview?.variants?.length ?? 0) > 0 ||
		catalogPlanLicenseParents({ preview }).length > 0
	);
};

export const isConfirmOnlyPlanChangeDialog = ({
	preview,
	showVersionStrategy,
	showVariantScope,
	showLicenseParentScope,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
	showVersionStrategy: boolean;
	showVariantScope: boolean;
	showLicenseParentScope: boolean;
}): boolean =>
	(catalogPreviewHasAliasReplacement({ preview }) ||
		catalogPreviewHasPlanIdChange({ preview }) ||
		catalogPreviewHasVersionSlugChange({ preview }) ||
		catalogPreviewHasPromotion({ preview })) &&
	!showVersionStrategy &&
	!showVariantScope &&
	!showLicenseParentScope;

export const isAliasOnlyPlanChangeDialog = ({
	preview,
	showVersionStrategy,
	showVariantScope,
	showLicenseParentScope,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
	showVersionStrategy: boolean;
	showVariantScope: boolean;
	showLicenseParentScope: boolean;
}): boolean =>
	catalogPreviewHasAliasReplacement({ preview }) &&
	!showVersionStrategy &&
	!showVariantScope &&
	!showLicenseParentScope;

export const strategyForCatalogPreview = ({
	choice,
	options,
	isLatest,
}: {
	choice: CatalogVersionChoice;
	options: CatalogPlanVersioningStrategy[] | undefined;
	isLatest: boolean;
}): CatalogPlanVersioningStrategy | undefined => {
	if (choice === "new") {
		if (options) {
			return options.includes("new_version") ? "new_version" : undefined;
		}
		return isLatest ? "new_version" : undefined;
	}
	if (choice === "all") {
		return options?.includes("all_versions") ? "all_versions" : undefined;
	}
	return undefined;
};

export const hasCatalogMigrationTargets = ({
	preview,
}: {
	preview: PreviewUpdateCatalogResponse | undefined;
}): boolean => (preview?.migrations?.length ?? 0) > 0;

export const buildCatalogPropagate = ({
	variants,
	licenseParents,
}: {
	variants: NonNullable<CatalogPropagateParams["variants"]>;
	licenseParents: NonNullable<CatalogPropagateParams["license_parents"]>;
}): CatalogPropagateParams | undefined => {
	if (variants.length === 0 && licenseParents.length === 0) {
		return undefined;
	}
	return {
		...(variants.length > 0 ? { variants } : {}),
		...(licenseParents.length > 0 ? { license_parents: licenseParents } : {}),
	};
};

/** A variant or license-parent lane entry, as far as mint detection cares. */
type FollowerVersioningPreview = {
	versioning?: { resolved: CatalogPlanVersioningStrategy };
	state: { has_customers: boolean };
};

/** This follower gets a new row: the server resolved one, or the base mint cascades. */
export const followerMintsNewVersion = ({
	follower,
	baseMintsNewVersion,
}: {
	follower: FollowerVersioningPreview;
	baseMintsNewVersion: boolean;
}): boolean => {
	if (follower.versioning?.resolved === "new_version") return true;
	return (
		follower.versioning === undefined &&
		baseMintsNewVersion &&
		follower.state.has_customers
	);
};

/**
 * Would following this base mint give the variant its own new row? The variant lane
 * always reports `versioning`, and the discover preview sends no propagate, so its
 * `resolved` reads `existing` even when the save would mint. Mirrors the server's
 * gate: the base mints and this variant's active row has versionable customers.
 */
export const variantFollowMintsNewVersion = ({
	variant,
	baseMintsNewVersion,
}: {
	variant: FollowerVersioningPreview;
	baseMintsNewVersion: boolean;
}): boolean => {
	if (variant.versioning?.resolved === "new_version") return true;
	return baseMintsNewVersion && variant.state.has_customers;
};

export const getLicenseParentVersionKey = ({
	plan_id,
	version,
}: Pick<CatalogLicenseParentPreview, "plan_id" | "version">) =>
	makePlanKey({ planId: plan_id, version });

/** Every linked version of a parent plan, newest first. */
export const licenseParentVersions = ({
	parent,
}: {
	parent: CatalogLicenseParentPreview;
}): CatalogLicenseParentVersionPreview[] =>
	[parent, ...(parent.sibling_versions ?? [])].sort(
		(left, right) => right.version - left.version,
	);

/** Every previewed version of a variant plan, newest first. */
export const variantVersions = ({
	variant,
}: {
	variant: CatalogVariantPreview;
}): CatalogVariantVersionPreview[] =>
	[variant, ...(variant.sibling_versions ?? [])].sort(
		(left, right) => right.version - left.version,
	);

export type CatalogPlanChangeDiff = {
	itemChanges: PlanItemChangeV0[];
	hasPriceChange: boolean;
	settingChanges: SettingChange[];
	licenseChanges: PlanLicenseChangeV0[];
};

export const emptyCatalogPlanChangeDiff = (): CatalogPlanChangeDiff => ({
	itemChanges: [],
	hasPriceChange: false,
	settingChanges: [],
	licenseChanges: [],
});

export const planChangeToTargetDiff = ({
	planChange,
}: {
	planChange?: PlanChangeV0 | null;
}): CatalogPlanChangeDiff => ({
	itemChanges: planChange?.item_changes ?? [],
	hasPriceChange: planChange?.price_change !== undefined,
	settingChanges: previousAttributesToSettingChanges(
		planChange?.previous_attributes,
	),
	licenseChanges: planChange?.license_changes ?? [],
});

export const catalogTargetDiffHasChanges = ({
	itemChanges,
	hasPriceChange,
	licenseChanges,
	settingChanges,
}: CatalogPlanChangeDiff) =>
	itemChanges.length > 0 ||
	hasPriceChange ||
	licenseChanges.length > 0 ||
	settingChanges.length > 0;

const dedupeBy = <T>(entries: T[], keyOf: (entry: T) => string): T[] => {
	const seen = new Map<string, T>();
	for (const entry of entries) seen.set(keyOf(entry), entry);
	return [...seen.values()];
};

/** Union of what a multi-version scope will change, deduped across versions. */
export const mergeCatalogPlanChangeDiffs = (
	diffs: CatalogPlanChangeDiff[],
): CatalogPlanChangeDiff => ({
	itemChanges: dedupeBy(
		diffs.flatMap((diff) => diff.itemChanges),
		(change) => `${change.feature_id}:${change.action}`,
	),
	hasPriceChange: diffs.some((diff) => diff.hasPriceChange),
	settingChanges: dedupeBy(
		diffs.flatMap((diff) => diff.settingChanges),
		(change) => change.key,
	),
	licenseChanges: dedupeBy(
		diffs.flatMap((diff) => diff.licenseChanges),
		(change) => `${change.license_plan_id}:${change.action}`,
	),
});

/** Same preference as propagation targets, applied per parent version. */
export const applyLicenseParentScopedDiffs = ({
	targets,
	fallbackDiff,
	scopedByKey,
}: {
	targets: LicenseParentTarget[];
	fallbackDiff: CatalogPlanChangeDiff;
	scopedByKey?: Map<string, PlanChangeV0 | null | undefined>;
}): LicenseParentTarget[] =>
	targets.map((target) => ({
		...target,
		versions: target.versions.map((entry) => {
			if (scopedByKey?.has(entry.key)) {
				const scopedDiff = planChangeToTargetDiff({
					planChange: scopedByKey.get(entry.key),
				});
				if (catalogTargetDiffHasChanges(scopedDiff)) {
					return { ...entry, ...scopedDiff };
				}
			}
			if (catalogTargetDiffHasChanges(entry)) return entry;
			return { ...entry, ...fallbackDiff };
		}),
	}));

export const toVariantPropagationTargets = ({
	variants,
	namesByPlanId,
	baseMintsNewVersion = false,
}: {
	variants: CatalogVariantPreview[] | undefined;
	namesByPlanId: Record<string, string>;
	baseMintsNewVersion?: boolean;
}): VariantTarget[] =>
	(variants ?? []).map((variant) => {
		const versions = variantVersions({ variant });
		return {
			planId: variant.plan_id,
			name: namesByPlanId[variant.plan_id] ?? variant.plan_id,
			versions: versions.map((entry) => ({
				version: entry.version,
				...(entry.version_slug ? { versionSlug: entry.version_slug } : {}),
				key: makePlanKey({
					planId: variant.plan_id,
					version: entry.version,
				}),
				conflicts: entry.conflicts ?? [],
				...planChangeToTargetDiff({ planChange: entry.plan_change }),
			})),
			mintsNewVersion: variantFollowMintsNewVersion({
				variant,
				baseMintsNewVersion,
			}),
			mintVersion:
				Math.max(...versions.map((entry) => entry.version), variant.version) +
				1,
			takenSlugs: versions.map((entry) => entry.version_slug).filter(Boolean),
		};
	});

/** One parent plan and every version of it that offers the edited child. */
export type LicenseParentTarget = {
	planId: string;
	name: string;
	versions: LicenseParentVersion[];
};

/** One variant plan and the versions of it this base edit can pin. */
export type VariantTarget = LicenseParentTarget & {
	mintsNewVersion: boolean;
	mintVersion: number;
	takenSlugs: string[];
};

/** Newest row in the lane is the one a base mint would clone. */
export const variantTargetMintsInSelection = ({
	target,
	selectedKeys,
}: {
	target: VariantTarget;
	selectedKeys: string[];
}): boolean => {
	if (!target.mintsNewVersion) return false;
	const newest = target.versions[0];
	if (!newest) return false;
	return (
		planScopeIsWholePlan({ selectedKeys, planId: target.planId }) ||
		planScopeIncludesVersion({
			selectedKeys,
			planId: target.planId,
			version: newest.version,
		})
	);
};

export type LicenseParentVersion = {
	version: number;
	versionSlug?: string;
	key: string;
	conflicts: CatalogConflictPreview[];
} & CatalogPlanChangeDiff;

export const toLicenseParentTargets = ({
	parents,
}: {
	parents: CatalogLicenseParentPreview[] | undefined;
}): LicenseParentTarget[] =>
	(parents ?? []).map((parent) => ({
		planId: parent.plan_id,
		name: parent.name,
		versions: licenseParentVersions({ parent }).map((entry) => ({
			version: entry.version,
			...(entry.version_slug ? { versionSlug: entry.version_slug } : {}),
			key: getLicenseParentVersionKey(entry),
			conflicts: entry.conflicts ?? [],
			...planChangeToTargetDiff({ planChange: entry.plan_change }),
		})),
	}));

/** Versions a selection actually applies to — every version when whole-plan. */
export const licenseParentVersionsInScope = ({
	target,
	selectedKeys,
}: {
	target: LicenseParentTarget;
	selectedKeys: string[];
}): LicenseParentVersion[] => {
	if (planScopeIsWholePlan({ selectedKeys, planId: target.planId })) {
		return target.versions;
	}
	return target.versions.filter((entry) =>
		planScopeIncludesVersion({
			selectedKeys,
			planId: target.planId,
			version: entry.version,
		}),
	);
};

/** Plan-selection keys → pinned targets. A whole-plan key expands client-side
 * into one pinned target per linked version — the API only accepts pins. */
export const buildSelectedLicenseParentPropagate = ({
	selectedKeys,
	targets = [],
}: {
	selectedKeys: string[];
	targets?: LicenseParentTarget[];
}): NonNullable<CatalogPropagateParams["license_parents"]> =>
	selectedKeys.map(parsePlanKey).flatMap(({ planId, version }) => {
		if (version !== undefined) return [{ plan_id: planId, version }];
		const target = targets.find((entry) => entry.planId === planId);
		return (target?.versions ?? []).map((entry) => ({
			plan_id: planId,
			version: entry.version,
		}));
	});

/** Selected variant keys → targets. Pins per version, except under a base
 * mint, where targets are plan-level and the server resolves the row. */
export const buildSelectedVariantPropagate = ({
	selectedKeys,
	targets = [],
	baseMintsNewVersion = false,
}: {
	selectedKeys: string[];
	targets?: VariantTarget[];
	baseMintsNewVersion?: boolean;
}): NonNullable<CatalogPropagateParams["variants"]> => {
	if (baseMintsNewVersion) {
		const planIds = [
			...new Set(selectedKeys.map((key) => parsePlanKey(key).planId)),
		];
		return planIds.map((planId) => ({ plan_id: planId }));
	}
	return buildSelectedLicenseParentPropagate({ selectedKeys, targets });
};

export type CatalogMigrateTargetRole = "base" | "variant" | "license_parent";

export type CatalogMigrateTargetRow = {
	version: number;
	isCurrent: boolean;
	isNew: boolean;
	customerCount: number;
	conflicts: CatalogConflictPreview[];
} & CatalogPlanChangeDiff;

export type CatalogMigrateTarget = {
	id: string;
	name: string;
	role: CatalogMigrateTargetRole;
	rows: CatalogMigrateTargetRow[];
};

const customerCountOf = ({
	usage,
}: {
	usage?: { customers?: { count?: number } };
}) => usage?.customers?.count ?? 0;

const migrateRowFromPlanChange = ({
	version,
	isCurrent,
	isNew,
	planChange,
	customerCount,
	conflicts,
}: {
	version: number;
	isCurrent: boolean;
	isNew: boolean;
	planChange?: PlanChangeV0 | null;
	customerCount: number;
	conflicts?: CatalogConflictPreview[];
}): CatalogMigrateTargetRow => ({
	version,
	isCurrent,
	isNew,
	...planChangeToTargetDiff({ planChange }),
	customerCount,
	conflicts: conflicts ?? [],
});

const licenseParentVersionIsSelected = ({
	planId,
	version,
	selectedKeys,
}: {
	planId: string;
	version: number;
	selectedKeys: string[];
}): boolean =>
	planScopeIsWholePlan({ selectedKeys, planId }) ||
	planScopeIncludesVersion({ selectedKeys, planId, version });

/**
 * One card per parent plan, newest version first. A mint happens once for the
 * plan, so it collapses the card to the single new version it creates.
 */
const buildLicenseParentMigrateTargets = ({
	preview,
	selectedLicenseParentKeys,
	isNewVersion,
	includeSiblingLinked,
}: {
	preview: CatalogPlanUpdatePreview;
	selectedLicenseParentKeys: string[];
	isNewVersion: boolean;
	includeSiblingLinked: boolean;
}): CatalogMigrateTarget[] => {
	const targets: CatalogMigrateTarget[] = [];
	for (const parent of catalogPlanLicenseParents({
		preview,
		includeSiblingLinked,
	})) {
		const selectedByScope = licenseParentVersions({ parent }).filter((entry) =>
			licenseParentVersionIsSelected({
				planId: parent.plan_id,
				version: entry.version,
				selectedKeys: selectedLicenseParentKeys,
			}),
		);
		const changed = selectedByScope.filter(
			(entry) =>
				entry.license_action !== undefined &&
				entry.license_action !== "unchanged",
		);
		const selected = changed.length > 0 ? changed : selectedByScope;
		if (selected.length === 0) continue;

		const mints = followerMintsNewVersion({
			follower: parent,
			baseMintsNewVersion: isNewVersion,
		});
		const rows = mints
			? [
					migrateRowFromPlanChange({
						version:
							parent.versioning?.new_version ??
							(parent.versioning ? parent.version : parent.version + 1),
						isCurrent: false,
						isNew: true,
						planChange: parent.plan_change,
						customerCount: customerCountOf({ usage: parent.state.usage }),
						conflicts: parent.conflicts,
					}),
				]
			: selected.map((entry) =>
					migrateRowFromPlanChange({
						version: entry.version,
						isCurrent: entry.version === parent.version,
						isNew: false,
						planChange: entry.plan_change,
						customerCount: customerCountOf({ usage: entry.state.usage }),
						conflicts: entry.conflicts,
					}),
				);

		targets.push({
			id: `license-parent:${parent.plan_id}`,
			name: parent.name,
			role: "license_parent",
			rows,
		});
	}
	return targets;
};

export const buildCatalogMigrateTargets = ({
	preview,
	selectedVariantKeys,
	selectedLicenseParentKeys,
	versionChoice,
	currentVersion,
	baseName,
}: {
	preview: CatalogPlanUpdatePreview;
	selectedVariantKeys: string[];
	selectedLicenseParentKeys: string[];
	versionChoice: CatalogVersionChoice;
	currentVersion: number;
	baseName: string;
}): CatalogMigrateTarget[] => {
	const includeHistorical = versionChoice === "all";
	const isNewVersion = versionChoice === "new";
	const baseCreatesNewVersion = isNewVersion && preview.state.has_customers;

	const baseRows: CatalogMigrateTargetRow[] = [
		migrateRowFromPlanChange({
			version: baseCreatesNewVersion
				? (preview.versioning?.new_version ?? currentVersion + 1)
				: preview.version,
			isCurrent: !baseCreatesNewVersion,
			isNew: baseCreatesNewVersion,
			planChange: preview.plan_change,
			customerCount: customerCountOf({ usage: preview.state.usage }),
		}),
		...(includeHistorical
			? (preview.sibling_versions ?? []).map((sibling) =>
					migrateRowFromPlanChange({
						version: sibling.version,
						isCurrent: false,
						isNew: false,
						planChange: sibling.plan_change,
						customerCount: customerCountOf({ usage: sibling.state.usage }),
						conflicts: sibling.conflicts,
					}),
				)
			: []),
	];

	const targets: CatalogMigrateTarget[] = [
		{
			id: preview.plan_id,
			name: baseName,
			role: "base",
			rows: baseRows,
		},
	];

	const variantLanes = catalogPlanVariantLanes({
		preview,
		includeSiblingRows: includeHistorical,
	});
	for (const variant of variantLanes) {
		const selectedByScope = variantVersions({ variant }).filter((entry) =>
			licenseParentVersionIsSelected({
				planId: variant.plan_id,
				version: entry.version,
				selectedKeys: selectedVariantKeys,
			}),
		);
		if (selectedByScope.length === 0) continue;
		const createsNewVersion = variantFollowMintsNewVersion({
			variant,
			baseMintsNewVersion: isNewVersion,
		});
		const affectedVersions = selectedByScope.filter(
			(entry) => entry.variant_action !== "unchanged",
		);
		const rowsToShow =
			affectedVersions.length > 0 ? affectedVersions : selectedByScope;
		// A mint happens once for the plan — collapse the card to the new row.
		const rows = createsNewVersion
			? [
					migrateRowFromPlanChange({
						version:
							variant.versioning?.new_version ??
							Math.max(
								...variantVersions({ variant }).map((entry) => entry.version),
							) + 1,
						isCurrent: false,
						isNew: true,
						planChange: variant.plan_change,
						customerCount: customerCountOf({ usage: variant.state.usage }),
						conflicts: variant.conflicts,
					}),
				]
			: rowsToShow.map((entry) =>
					migrateRowFromPlanChange({
						version: entry.version,
						isCurrent: entry.version === variant.version,
						isNew: false,
						planChange: entry.plan_change,
						customerCount: customerCountOf({ usage: entry.state.usage }),
						conflicts: entry.conflicts,
					}),
				);
		targets.push({
			id: variant.plan_id,
			name: variant.plan_id,
			role: "variant",
			rows,
		});
	}

	targets.push(
		...buildLicenseParentMigrateTargets({
			preview,
			selectedLicenseParentKeys,
			isNewVersion,
			includeSiblingLinked: versionChoice !== "update",
		}),
	);

	return targets;
};
