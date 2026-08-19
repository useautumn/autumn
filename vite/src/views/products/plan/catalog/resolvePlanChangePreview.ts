import type {
	CatalogPlanUpdatePreview,
	CatalogPlanVersioningStrategy,
	CatalogPropagateParams,
} from "@autumn/shared";
import {
	getDefaultLicenseParentKeys,
	getDefaultPropagationTargetIds,
} from "../versioning/getDefaultPropagationTargetIds";
import {
	previousAttributesToSettingChanges,
	type SettingChange,
} from "../versioning/PlanSettingsChanges";
import {
	buildCatalogPropagate,
	buildSelectedLicenseParentPropagate,
	type CatalogVersionChoice,
	isCatalogMetadataOnly,
	type LicenseParentTarget,
	licenseParentVersions,
	type PropagationTarget,
	previewOpensStrategyStep,
	strategyForCatalogPreview,
	toLicenseParentTargets,
	toVariantPropagationTargets,
} from "./catalogPlanPreview";

const EMPTY_SELECTION: string[] = [];

export const resolveEffectiveVersionChoice = ({
	choice,
	showNewOption,
	showAllOption,
}: {
	choice: CatalogVersionChoice;
	showNewOption: boolean;
	showAllOption: boolean;
}): CatalogVersionChoice => {
	if (choice === "new" && !showNewOption) return "update";
	if (choice === "all" && !showAllOption) return "update";
	return choice;
};

export const resolveVersioningOptionVisibility = ({
	options,
	isLatest,
	hasSiblingVersions,
}: {
	options: CatalogPlanVersioningStrategy[] | undefined;
	isLatest: boolean;
	hasSiblingVersions: boolean;
}) => {
	const showNewOption = options ? options.includes("new_version") : isLatest;
	const showAllOption =
		!!options?.includes("all_versions") && hasSiblingVersions;
	const showUpdateOption =
		!options ||
		options.includes("existing") ||
		!(showNewOption || showAllOption);

	return { showNewOption, showAllOption, showUpdateOption };
};

export type PlanChangePreviewModel = {
	preview: CatalogPlanUpdatePreview | undefined;
	isMetadataOnly: boolean;
	showNewOption: boolean;
	showAllOption: boolean;
	showUpdateOption: boolean;
	effectiveVersionChoice: CatalogVersionChoice;
	strategy: CatalogPlanVersioningStrategy | undefined;
	variantTargets: PropagationTarget[];
	defaultVariantIds: string[];
	selectedVariantIds: string[];
	showVersionStrategy: boolean;
	showVariantScope: boolean;
	effectiveVariantIds: string[];
	licenseParentTargets: LicenseParentTarget[];
	defaultLicenseParentKeys: string[];
	selectedLicenseParentKeys: string[];
	showLicenseParentScope: boolean;
	versionChoiceOnlyAffectsParents: boolean;
	effectiveLicenseParentKeys: string[];
	propagate: CatalogPropagateParams | undefined;
	settingsChanges: SettingChange[];
};

/** Dialog decisions from the discover preview + user picks. Never from a scoped preview. */
export const resolvePlanChangePreview = ({
	preview,
	versionChoice,
	variantSelection,
	licenseParentSelection,
	isLatest,
	namesByPlanId,
}: {
	preview: CatalogPlanUpdatePreview | undefined;
	versionChoice: CatalogVersionChoice;
	variantSelection: string[] | null;
	licenseParentSelection: string[] | null;
	isLatest: boolean;
	namesByPlanId: Record<string, string>;
}): PlanChangePreviewModel => {
	const isMetadataOnly = isCatalogMetadataOnly({ preview });
	const versioningOptions = preview?.versioning?.options;
	const { showNewOption, showAllOption, showUpdateOption } =
		resolveVersioningOptionVisibility({
			options: versioningOptions,
			isLatest,
			hasSiblingVersions: (preview?.sibling_versions?.length ?? 0) > 0,
		});
	const effectiveVersionChoice = resolveEffectiveVersionChoice({
		choice: versionChoice,
		showNewOption,
		showAllOption,
	});

	const variantTargets = toVariantPropagationTargets({
		variants: preview?.variants,
		namesByPlanId,
		includeHistoricalVersions: effectiveVersionChoice === "all",
	});
	const defaultVariantIds = getDefaultPropagationTargetIds({
		targets: variantTargets,
	});
	const selectedVariantIds = variantSelection ?? defaultVariantIds;
	const showVariantScope =
		!!preview?.plan_change?.customize &&
		variantTargets.length > 0 &&
		(isLatest || effectiveVersionChoice === "all");
	const effectiveVariantIds = showVariantScope
		? selectedVariantIds
		: EMPTY_SELECTION;

	const licenseParentTargets = toLicenseParentTargets({
		parents: preview?.license_parents,
	});
	const defaultLicenseParentKeys = getDefaultLicenseParentKeys({
		targets: licenseParentTargets,
	});
	const selectedLicenseParentKeys =
		licenseParentSelection ?? defaultLicenseParentKeys;
	const showLicenseParentScope = licenseParentTargets.length > 0;
	const effectiveLicenseParentKeys = showLicenseParentScope
		? selectedLicenseParentKeys
		: EMPTY_SELECTION;

	return {
		preview,
		isMetadataOnly,
		showNewOption,
		showAllOption,
		showUpdateOption,
		effectiveVersionChoice,
		strategy: strategyForCatalogPreview({
			choice: effectiveVersionChoice,
			options: versioningOptions,
			isLatest,
		}),
		variantTargets,
		defaultVariantIds,
		selectedVariantIds,
		showVersionStrategy:
			!isMetadataOnly && previewOpensStrategyStep({ preview }),
		showVariantScope,
		effectiveVariantIds,
		licenseParentTargets,
		defaultLicenseParentKeys,
		selectedLicenseParentKeys,
		showLicenseParentScope,
		versionChoiceOnlyAffectsParents:
			!preview?.state.has_customers &&
			(preview?.license_parents ?? []).some((parent) =>
				licenseParentVersions({ parent }).some(
					(entry) => entry.state.has_customers,
				),
			),
		effectiveLicenseParentKeys,
		propagate: buildCatalogPropagate({
			variantIds: effectiveVariantIds,
			licenseParents: buildSelectedLicenseParentPropagate({
				selectedKeys: effectiveLicenseParentKeys,
			}),
		}),
		settingsChanges: previousAttributesToSettingChanges(
			preview?.plan_change?.previous_attributes,
		),
	};
};
