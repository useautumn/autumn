import type {
	CatalogConflictPreview,
	CatalogLicenseParentPreview,
	CatalogLicenseParentVersionPreview,
	CatalogPlanUpdatePreview,
	CatalogPlanVersioningStrategy,
	CatalogPropagateParams,
	CatalogVariantPreview,
	CatalogVariantVersionPreview,
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

export const catalogPreviewOpensDialog = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): boolean =>
	previewOpensStrategyStep({ preview }) ||
	(preview?.variants?.length ?? 0) > 0 ||
	(preview?.license_parents?.length ?? 0) > 0;

export const isCatalogMetadataOnly = ({
	preview,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
}): boolean =>
	!!preview &&
	!preview.plan_change?.customize &&
	(preview.plan_change?.license_changes?.length ?? 0) === 0;

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

const toPropagationTarget = ({
	id,
	name,
	detail,
	conflicts,
	planChange,
}: {
	id: string;
	name: string;
	detail: string;
	conflicts?: CatalogConflictPreview[];
	planChange?: PlanChangeV0 | null;
}): PropagationTarget => ({
	id,
	name,
	detail,
	conflicts: conflicts ?? [],
	...planChangeToTargetDiff({ planChange }),
});

export const toVariantPropagationTargets = ({
	variants,
	namesByPlanId,
	includeHistoricalVersions = false,
}: {
	variants: CatalogVariantPreview[] | undefined;
	namesByPlanId: Record<string, string>;
	includeHistoricalVersions?: boolean;
}): PropagationTarget[] =>
	(variants ?? []).map((variant) =>
		toPropagationTarget({
			id: variant.plan_id,
			name: namesByPlanId[variant.plan_id] ?? variant.plan_id,
			detail: variant.plan_id,
			conflicts: dedupeBy(
				(includeHistoricalVersions
					? variantVersions({ variant })
					: [variant]
				).flatMap((entry) => entry.conflicts ?? []),
				(conflict) => JSON.stringify(conflict),
			),
			planChange: variant.plan_change,
		}),
	);

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

		const mints =
			parent.versioning?.resolved === "new_version" ||
			(parent.versioning === undefined &&
				isNewVersion &&
				parent.state.has_customers);
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
		const createsNewVersion =
			variant.versioning?.resolved === "new_version" ||
			(variant.versioning === undefined &&
				isNewVersion &&
				variant.state.has_customers);
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
