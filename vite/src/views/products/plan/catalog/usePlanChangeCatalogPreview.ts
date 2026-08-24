import type {
	Feature,
	FrontendProduct,
	PlanChangeV0,
	PlanLicenseParams,
} from "@autumn/shared";
import { usePreviewUpdateCatalog } from "@/hooks/queries/catalog/usePreviewUpdateCatalog";
import {
	type MintSlugSelection,
	propagateWithMintSlugs,
} from "../versioning/mintTargetSlugs";
import {
	buildCatalogUpdatePlans,
	tryBuildUpdateCatalogPlanParams,
} from "./buildUpdateCatalogPlanParams";
import {
	applyLicenseParentScopedDiffs,
	applyPropagationTargetDiffs,
	buildCatalogMigrateTargets,
	type CatalogVersionChoice,
	getLicenseParentVersionKey,
	hasCatalogMigrationTargets,
	licenseParentVersions,
	planChangeToTargetDiff,
} from "./catalogPlanPreview";
import { resolvePlanChangePreview } from "./resolvePlanChangePreview";

export const usePlanChangeCatalogPreview = ({
	open,
	baseProduct,
	product,
	features,
	licenses,
	versionChoice,
	variantSelection,
	licenseParentSelection,
	includeCustom,
	isLatest,
	namesByPlanId,
	persistedBasePlanId,
}: {
	open: boolean;
	baseProduct?: FrontendProduct | null;
	product: FrontendProduct;
	features: Feature[];
	licenses?: PlanLicenseParams[];
	versionChoice: CatalogVersionChoice;
	variantSelection: string[] | null;
	licenseParentSelection: string[] | null;
	includeCustom: boolean;
	isLatest: boolean;
	namesByPlanId: Record<string, string>;
	persistedBasePlanId?: string | null;
}) => {
	const contentParams = tryBuildUpdateCatalogPlanParams({
		baseProduct,
		editedProduct: product,
		features,
		licenses,
	});

	const { data: discoverCatalog } = usePreviewUpdateCatalog({
		params: contentParams ? { plans: [contentParams] } : null,
		enabled: open,
	});
	const discoverPreview = discoverCatalog?.plans[0];

	const model = resolvePlanChangePreview({
		preview: discoverPreview,
		versionChoice,
		variantSelection,
		licenseParentSelection,
		isLatest,
		namesByPlanId,
	});

	const scopedParams = tryBuildUpdateCatalogPlanParams({
		baseProduct,
		editedProduct: product,
		features,
		versioning: model.strategy,
		propagate: model.propagate,
		licenses,
		migration:
			model.strategy === "new_version"
				? undefined
				: { draft: true, include_custom: includeCustom },
	});

	const { data: scopedCatalog } = usePreviewUpdateCatalog({
		params: scopedParams ? { plans: [scopedParams] } : null,
		enabled: open && !!discoverPreview,
	});

	const scopedPreview = scopedCatalog?.plans[0];
	const fallbackDiff = planChangeToTargetDiff({
		planChange: discoverPreview?.plan_change,
	});
	const variantTargets = applyPropagationTargetDiffs({
		targets: model.variantTargets,
		fallbackDiff,
		scopedById: new Map(
			(scopedPreview?.variants ?? []).map((variant) => [
				variant.plan_id,
				variant.plan_change ?? null,
			]),
		),
	});
	const licenseParentTargets = applyLicenseParentScopedDiffs({
		targets: model.licenseParentTargets,
		fallbackDiff,
		scopedByKey: new Map(
			(scopedPreview?.license_parents ?? []).flatMap((parent) =>
				licenseParentVersions({ parent }).map(
					(entry) =>
						[getLicenseParentVersionKey(entry), entry.plan_change ?? null] as [
							string,
							PlanChangeV0 | null,
						],
				),
			),
		),
	});
	const migratePlanPreview = scopedPreview ?? discoverPreview;
	const migrateNeeded = hasCatalogMigrationTargets({
		preview: scopedCatalog ?? discoverCatalog,
	});
	const migrateTargets = migratePlanPreview
		? buildCatalogMigrateTargets({
				preview: migratePlanPreview,
				selectedVariantIds: model.effectiveVariantIds,
				selectedLicenseParentKeys: model.effectiveLicenseParentKeys,
				versionChoice: model.effectiveVersionChoice,
				currentVersion: product.version,
				baseName: product.name ?? product.id,
			})
		: [];

	/** Typed slugs are save-only — sending them to preview would surface collisions early. */
	const buildSaveParams = ({
		migrate,
		slugSelection,
	}: {
		migrate: boolean;
		slugSelection: MintSlugSelection;
	}) => {
		const mints = model.strategy === "new_version";
		const slug = mints ? slugSelection.base.trim() || undefined : undefined;
		return buildCatalogUpdatePlans({
			baseProduct,
			editedProduct: product,
			features,
			versioning: model.strategy,
			newVersionSlug: mints
				? { source: "minted_row", slug }
				: { source: "renamed_row" },
			propagate: mints
				? propagateWithMintSlugs({
						propagate: model.propagate,
						selection: slugSelection,
					})
				: model.propagate,
			licenses,
			migration:
				migrate && migrateNeeded && model.strategy !== "new_version"
					? { draft: true, include_custom: includeCustom }
					: undefined,
			persistedBasePlanId,
		});
	};

	return {
		...model,
		variantTargets,
		licenseParentTargets,
		migrateNeeded,
		migrateTargets,
		buildSaveParams,
	};
};
