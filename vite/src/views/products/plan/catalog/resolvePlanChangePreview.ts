import type {
	CatalogPlanUpdatePreview,
	CatalogPlanVersioningStrategy,
	CatalogPropagateParams,
} from "@autumn/shared";
import { getDefaultPropagationTargetIds } from "../versioning/getDefaultPropagationTargetIds";
import type { PropagationTarget } from "../versioning/PropagationTargetsStep";
import {
	type SettingChange,
	previousAttributesToSettingChanges,
} from "../versioning/PlanSettingsChanges";
import {
	type CatalogVersionChoice,
	buildCatalogPropagate,
	buildSelectedLicenseParentPropagate,
	isCatalogMetadataOnly,
	previewOpensStrategyStep,
	strategyForCatalogPreview,
	toLicenseParentPropagationTargets,
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
	hasLicenseChanges,
	licenseParentCount,
}: {
	options: CatalogPlanVersioningStrategy[] | undefined;
	isLatest: boolean;
	hasLicenseChanges: boolean;
	licenseParentCount: number;
}) => {
	const showNewOption = options ? options.includes("new_version") : isLatest;
	const showAllOption =
		!!options?.includes("all_versions") &&
		!hasLicenseChanges &&
		licenseParentCount === 0;
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
	licenseParentTargets: PropagationTarget[];
	defaultLicenseParentIds: string[];
	selectedLicenseParentIds: string[];
	showLicenseParentScope: boolean;
	versionChoiceOnlyAffectsParents: boolean;
	effectiveLicenseParentIds: string[];
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
	const hasLicenseChanges =
		(preview?.plan_change?.license_changes?.length ?? 0) > 0;
	const { showNewOption, showAllOption, showUpdateOption } =
		resolveVersioningOptionVisibility({
			options: versioningOptions,
			isLatest,
			hasLicenseChanges,
			licenseParentCount: preview?.license_parents?.length ?? 0,
		});
	const effectiveVersionChoice = resolveEffectiveVersionChoice({
		choice: versionChoice,
		showNewOption,
		showAllOption,
	});

	const variantTargets = toVariantPropagationTargets({
		variants: preview?.variants,
		namesByPlanId,
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

	const licenseParentTargets = toLicenseParentPropagationTargets({
		parents: preview?.license_parents,
	});
	const defaultLicenseParentIds = getDefaultPropagationTargetIds({
		targets: licenseParentTargets,
	});
	const selectedLicenseParentIds =
		licenseParentSelection ?? defaultLicenseParentIds;
	const showLicenseParentScope = licenseParentTargets.length > 0;
	const effectiveLicenseParentIds = showLicenseParentScope
		? selectedLicenseParentIds
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
		defaultLicenseParentIds,
		selectedLicenseParentIds,
		showLicenseParentScope,
		versionChoiceOnlyAffectsParents:
			!preview?.state.has_customers &&
			(preview?.license_parents ?? []).some(
				(parent) => parent.state.has_customers,
			),
		effectiveLicenseParentIds,
		propagate: buildCatalogPropagate({
			variantIds: effectiveVariantIds,
			licenseParents: buildSelectedLicenseParentPropagate({
				parents: preview?.license_parents ?? [],
				selectedIds: effectiveLicenseParentIds,
			}),
		}),
		settingsChanges: previousAttributesToSettingChanges(
			preview?.plan_change?.previous_attributes,
		),
	};
};
