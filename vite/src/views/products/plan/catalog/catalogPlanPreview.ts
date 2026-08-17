import type {
	CatalogConflictPreview,
	CatalogLicenseParentPreview,
	CatalogPlanUpdatePreview,
	CatalogPlanVersioningStrategy,
	CatalogPropagateParams,
	CatalogVariantPreview,
	PlanItemChangeV0,
	PreviewUpdateCatalogResponse,
} from "@autumn/shared";
import type { PropagationTarget } from "../versioning/PropagationTargetsStep";
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
	licenseParents: { plan_id: string; version: number }[];
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

export const getLicenseParentTargetId = ({
	plan_id,
	version,
}: Pick<CatalogLicenseParentPreview, "plan_id" | "version">) =>
	`${plan_id}@${version}`;

export const toVariantPropagationTargets = ({
	variants,
	namesByPlanId,
}: {
	variants: CatalogVariantPreview[] | undefined;
	namesByPlanId: Record<string, string>;
}): PropagationTarget[] =>
	(variants ?? []).map((variant) => ({
		id: variant.plan_id,
		name: namesByPlanId[variant.plan_id] ?? variant.plan_id,
		detail: variant.plan_id,
		conflicts: variant.conflicts ?? [],
		itemChanges: variant.plan_change?.item_changes ?? [],
	}));

export const toLicenseParentPropagationTargets = ({
	parents,
}: {
	parents: CatalogLicenseParentPreview[] | undefined;
}): PropagationTarget[] =>
	(parents ?? []).map((parent) => ({
		id: getLicenseParentTargetId(parent),
		name: parent.name,
		detail: `${parent.plan_id} · v${parent.version}`,
		conflicts: parent.conflicts ?? [],
		itemChanges: parent.plan_change?.item_changes ?? [],
	}));

export const buildSelectedLicenseParentPropagate = ({
	parents,
	selectedIds,
}: {
	parents: CatalogLicenseParentPreview[];
	selectedIds: string[];
}) => {
	const selectedIdSet = new Set(selectedIds);
	return parents
		.filter((parent) =>
			selectedIdSet.has(getLicenseParentTargetId(parent)),
		)
		.map((parent) => ({
			plan_id: parent.plan_id,
			version: parent.version,
		}));
};

export type CatalogMigrateTargetRow = {
	version: number;
	isCurrent: boolean;
	isNew: boolean;
	itemChanges: PlanItemChangeV0[];
	hasPriceChange: boolean;
	settingChanges: SettingChange[];
	customerCount: number;
	conflicts: CatalogConflictPreview[];
};

export type CatalogMigrateTarget = {
	id: string;
	name: string;
	isBase: boolean;
	rows: CatalogMigrateTargetRow[];
};

const customerCountOf = ({
	usage,
}: {
	usage?: { customers: { count: number } };
}) => usage?.customers.count ?? 0;

export const buildCatalogMigrateTargets = ({
	preview,
	selectedVariantIds,
	selectedLicenseParentIds,
	versionChoice,
	currentVersion,
	baseName,
}: {
	preview: CatalogPlanUpdatePreview;
	selectedVariantIds: string[];
	selectedLicenseParentIds: string[];
	versionChoice: CatalogVersionChoice;
	currentVersion: number;
	baseName: string;
}): CatalogMigrateTarget[] => {
	const includeHistorical = versionChoice === "all";
	const isNewVersion = versionChoice === "new";
	const baseCreatesNewVersion =
		isNewVersion && preview.state.has_customers;

	const baseRows: CatalogMigrateTargetRow[] = [
		{
			version: baseCreatesNewVersion
				? (preview.versioning?.new_version ?? currentVersion + 1)
				: preview.version,
			isCurrent: !baseCreatesNewVersion,
			isNew: baseCreatesNewVersion,
			itemChanges: preview.plan_change?.item_changes ?? [],
			hasPriceChange: preview.plan_change?.price_change !== undefined,
			settingChanges: previousAttributesToSettingChanges(
				preview.plan_change?.previous_attributes,
			),
			customerCount: customerCountOf({ usage: preview.state.usage }),
			conflicts: [],
		},
		...(includeHistorical
			? (preview.sibling_versions ?? []).map((sibling) => ({
					version: sibling.version,
					isCurrent: false,
					isNew: false,
					itemChanges: sibling.plan_change?.item_changes ?? [],
					hasPriceChange: sibling.plan_change?.price_change !== undefined,
					settingChanges: previousAttributesToSettingChanges(
						sibling.plan_change?.previous_attributes,
					),
					customerCount: customerCountOf({ usage: sibling.state.usage }),
					conflicts: sibling.conflicts ?? [],
				}))
			: []),
	];

	const targets: CatalogMigrateTarget[] = [
		{
			id: preview.plan_id,
			name: baseName,
			isBase: true,
			rows: baseRows,
		},
	];

	for (const variantId of selectedVariantIds) {
		const variant = (preview.variants ?? []).find(
			(entry) => entry.plan_id === variantId,
		);
		if (!variant) continue;
		const createsNewVersion =
			isNewVersion && variant.state.has_customers;
		targets.push({
			id: variantId,
			name: variantId,
			isBase: false,
			rows: [
				{
					version: variant.version,
					isCurrent: !createsNewVersion,
					isNew: createsNewVersion,
					itemChanges: variant.plan_change?.item_changes ?? [],
					hasPriceChange: variant.plan_change?.price_change !== undefined,
					settingChanges: previousAttributesToSettingChanges(
						variant.plan_change?.previous_attributes,
					),
					customerCount: customerCountOf({ usage: variant.state.usage }),
					conflicts: variant.conflicts ?? [],
				},
			],
		});
	}

	const selectedLicenseParentIdSet = new Set(selectedLicenseParentIds);
	for (const parent of preview.license_parents ?? []) {
		const targetId = getLicenseParentTargetId(parent);
		if (!selectedLicenseParentIdSet.has(targetId)) continue;
		const createsNewVersion = isNewVersion && parent.state.has_customers;
		targets.push({
			id: `license-parent:${targetId}`,
			name: parent.name,
			isBase: false,
			rows: [
				{
					version: createsNewVersion ? parent.version + 1 : parent.version,
					isCurrent: !createsNewVersion,
					isNew: createsNewVersion,
					itemChanges: parent.plan_change?.item_changes ?? [],
					hasPriceChange: parent.plan_change?.price_change !== undefined,
					settingChanges: [],
					customerCount: customerCountOf({ usage: parent.state.usage }),
					conflicts: parent.conflicts ?? [],
				},
			],
		});
	}

	return targets;
};
