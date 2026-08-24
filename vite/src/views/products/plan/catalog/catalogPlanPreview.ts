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
		(preview?.license_parents?.length ?? 0) > 0
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
	variantIds,
	licenseParents,
}: {
	variantIds: string[];
	licenseParents: NonNullable<CatalogPropagateParams["license_parents"]>;
}): CatalogPropagateParams | undefined => {
	if (variantIds.length === 0 && licenseParents.length === 0) {
		return undefined;
	}
	return {
		...(variantIds.length > 0
			? { variants: variantIds.map((plan_id) => ({ plan_id })) }
			: {}),
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

export type PropagationTarget = {
	id: string;
	name: string;
	detail: string;
	conflicts: CatalogConflictPreview[];
	/** This target gets its own new row, so the save can name it. */
	mintsNewVersion: boolean;
	/** The version that row lands at — max+1, not active+1. */
	mintVersion: number;
	/** Display slugs this plan's versions already hold. */
	takenSlugs: string[];
} & CatalogPlanChangeDiff;

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

/** Discover variants have conflicts but no plan_change until propagate.
 * Prefer the scoped row when present; otherwise show the current plan's diff. */
export const applyPropagationTargetDiffs = ({
	targets,
	fallbackDiff,
	scopedById,
}: {
	targets: PropagationTarget[];
	fallbackDiff: CatalogPlanChangeDiff;
	scopedById?: Map<string, PlanChangeV0 | null | undefined>;
}): PropagationTarget[] =>
	targets.map((target) => {
		if (scopedById?.has(target.id)) {
			const scopedDiff = planChangeToTargetDiff({
				planChange: scopedById.get(target.id),
			});
			if (catalogTargetDiffHasChanges(scopedDiff)) {
				return { ...target, ...scopedDiff };
			}
		}
		if (catalogTargetDiffHasChanges(target)) return target;
		return { ...target, ...fallbackDiff };
	});

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
	includeHistoricalVersions = false,
	baseMintsNewVersion = false,
}: {
	variants: CatalogVariantPreview[] | undefined;
	namesByPlanId: Record<string, string>;
	includeHistoricalVersions?: boolean;
	baseMintsNewVersion?: boolean;
}): PropagationTarget[] =>
	(variants ?? []).map((variant) => {
		const versions = variantVersions({ variant });
		return {
			id: variant.plan_id,
			name: namesByPlanId[variant.plan_id] ?? variant.plan_id,
			detail: variant.plan_id,
			conflicts: dedupeBy(
				(includeHistoricalVersions ? versions : [variant]).flatMap(
					(entry) => entry.conflicts ?? [],
				),
				(conflict) => JSON.stringify(conflict),
			),
			mintsNewVersion: variantFollowMintsNewVersion({
				variant,
				baseMintsNewVersion,
			}),
			mintVersion:
				Math.max(...versions.map((entry) => entry.version), variant.version) +
				1,
			takenSlugs: versions.map((entry) => entry.version_slug).filter(Boolean),
			...planChangeToTargetDiff({ planChange: variant.plan_change }),
		};
	});

/** One parent plan and every version of it that offers the edited child. */
export type LicenseParentTarget = {
	planId: string;
	name: string;
	versions: LicenseParentVersion[];
};

export type LicenseParentVersion = {
	version: number;
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

/** Plan-selection keys → propagate targets. Whole plan means `all_versions`. */
export const buildSelectedLicenseParentPropagate = ({
	selectedKeys,
}: {
	selectedKeys: string[];
}): NonNullable<CatalogPropagateParams["license_parents"]> =>
	selectedKeys
		.map(parsePlanKey)
		.map(({ planId, version }) =>
			version === undefined
				? { plan_id: planId, versioning: "all_versions" as const }
				: { plan_id: planId, version },
		);

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
}: {
	preview: CatalogPlanUpdatePreview;
	selectedLicenseParentKeys: string[];
	isNewVersion: boolean;
}): CatalogMigrateTarget[] => {
	const targets: CatalogMigrateTarget[] = [];
	for (const parent of preview.license_parents ?? []) {
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
	selectedVariantIds,
	selectedLicenseParentKeys,
	versionChoice,
	currentVersion,
	baseName,
}: {
	preview: CatalogPlanUpdatePreview;
	selectedVariantIds: string[];
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

	for (const variantId of selectedVariantIds) {
		const variant = (preview.variants ?? []).find(
			(entry) => entry.plan_id === variantId,
		);
		if (!variant) continue;
		const createsNewVersion = followerMintsNewVersion({
			follower: variant,
			baseMintsNewVersion: isNewVersion,
		});
		const affectedVersions = variantVersions({ variant }).filter(
			(entry) => entry.variant_action !== "unchanged",
		);
		const rowsToShow =
			affectedVersions.length > 0 ? affectedVersions : [variant];
		targets.push({
			id: variantId,
			name: variantId,
			role: "variant",
			rows: rowsToShow.map((entry) => {
				const isTopLevel = entry.version === variant.version;
				return migrateRowFromPlanChange({
					version: entry.version,
					isCurrent: isTopLevel && !createsNewVersion,
					isNew: isTopLevel && createsNewVersion,
					planChange: entry.plan_change,
					customerCount: customerCountOf({ usage: entry.state.usage }),
					conflicts: entry.conflicts,
				});
			}),
		});
	}

	targets.push(
		...buildLicenseParentMigrateTargets({
			preview,
			selectedLicenseParentKeys,
			isNewVersion,
		}),
	);

	return targets;
};
