import type {
	CatalogPlanUpdatePreview,
	CatalogPlanVersioningStrategy,
	CatalogPropagateParams,
} from "@autumn/shared";
import { getDefaultLicenseParentKeys } from "../versioning/getDefaultPropagationTargetIds";
import {
	previousAttributesToSettingChanges,
	type SettingChange,
} from "../versioning/PlanSettingsChanges";
import {
	buildCatalogPropagate,
	buildSelectedLicenseParentPropagate,
	buildSelectedVariantPropagate,
	catalogPlanLicenseParents,
	catalogPlanVariantLanes,
	type CatalogVersionChoice,
	isCatalogMetadataOnly,
	type LicenseParentTarget,
	licenseParentVersions,
	previewOpensStrategyStep,
	strategyForCatalogPreview,
	toLicenseParentTargets,
	toVariantPropagationTargets,
	type VariantTarget,
} from "./catalogPlanPreview";

const EMPTY_SELECTION: string[] = [];

export const resolveEffectiveVersionChoice = ({
	choice,
	showNewOption,
	showAllOption,
	isMetadataOnly = false,
}: {
	choice: CatalogVersionChoice;
	showNewOption: boolean;
	showAllOption: boolean;
	/** No content to version, so the save edits the row it targets. */
	isMetadataOnly?: boolean;
}): CatalogVersionChoice => {
	if (isMetadataOnly) return "update";
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
	variantTargets: VariantTarget[];
	defaultVariantKeys: string[];
	selectedVariantKeys: string[];
	showVersionStrategy: boolean;
	showVariantScope: boolean;
	effectiveVariantKeys: string[];
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
		isMetadataOnly,
	});

	const strategy = strategyForCatalogPreview({
		choice: effectiveVersionChoice,
		options: versioningOptions,
		isLatest,
	});

	const variantLanes = catalogPlanVariantLanes({
		preview,
		includeSiblingRows: effectiveVersionChoice === "all",
	});
	const variantTargets = toVariantPropagationTargets({
		variants: variantLanes,
		namesByPlanId,
		baseMintsNewVersion: strategy === "new_version",
	});
	const defaultVariantKeys = getDefaultLicenseParentKeys({
		targets: variantTargets,
	});
	const availableVariantKeys = new Set(
		variantTargets.flatMap((target) => [
			target.planId,
			...target.versions.map((entry) => entry.key),
		]),
	);
	const selectedVariantKeys = (variantSelection ?? defaultVariantKeys).filter(
		(key) => availableVariantKeys.has(key),
	);
	// License-only edits propagate too, so any content change opens the step.
	const showVariantScope = !isMetadataOnly && variantTargets.length > 0;
	const effectiveVariantKeys = showVariantScope
		? selectedVariantKeys
		: EMPTY_SELECTION;

	const includeSiblingLinked = effectiveVersionChoice !== "update";
	const licenseParentTargets = toLicenseParentTargets({
		parents: catalogPlanLicenseParents({ preview, includeSiblingLinked }),
	});
	const defaultLicenseParentKeys = getDefaultLicenseParentKeys({
		targets: licenseParentTargets,
	});
	const availableLicenseParentKeys = new Set(
		licenseParentTargets.flatMap((target) => [
			target.planId,
			...target.versions.map((entry) => entry.key),
		]),
	);
	const selectedLicenseParentKeys = (
		licenseParentSelection ?? defaultLicenseParentKeys
	).filter((key) => availableLicenseParentKeys.has(key));
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
		strategy,
		variantTargets,
		defaultVariantKeys,
		selectedVariantKeys,
		showVersionStrategy:
			!isMetadataOnly && previewOpensStrategyStep({ preview }),
		showVariantScope,
		effectiveVariantKeys,
		licenseParentTargets,
		defaultLicenseParentKeys,
		selectedLicenseParentKeys,
		showLicenseParentScope,
		versionChoiceOnlyAffectsParents:
			!preview?.state.has_customers &&
			catalogPlanLicenseParents({ preview, includeSiblingLinked }).some(
				(parent) =>
					licenseParentVersions({ parent }).some(
						(entry) => entry.state.has_customers,
					),
			),
		effectiveLicenseParentKeys,
		propagate: buildCatalogPropagate({
			variants: buildSelectedVariantPropagate({
				selectedKeys: effectiveVariantKeys,
				targets: variantTargets,
				baseMintsNewVersion: strategy === "new_version",
			}),
			licenseParents: buildSelectedLicenseParentPropagate({
				selectedKeys: effectiveLicenseParentKeys,
				targets: licenseParentTargets,
			}),
		}),
		settingsChanges: previousAttributesToSettingChanges(
			preview?.plan_change?.previous_attributes,
		),
	};
};
