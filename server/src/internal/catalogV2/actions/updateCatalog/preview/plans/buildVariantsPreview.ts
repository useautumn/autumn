import type {
	CatalogPlanVersioning,
	CatalogPlanVersioningStrategy,
	CatalogVariantAction,
	CatalogVariantPreview,
	CatalogVariantVersionPreview,
	FullProduct,
} from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { catalogRowIdentity } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/catalogRowIdentity";
import { latestVariantsOfBase } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/variantPlanUtils";
import { withVariantConflicts } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/conflicts/withVariantConflicts";
import { customerUsageForPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/buildPlanUsage";
import { computeVersioningOptionsForPlan } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/versioningOptions/computeVersioningOptionsForPlan";
import type {
	PreviewCatalogContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { aliasReplacementForPlan } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/aliasReplacementForPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

const byPlanThenVersion = (
	left: CatalogVariantPreview,
	right: CatalogVariantPreview,
) => left.plan_id.localeCompare(right.plan_id) || left.version - right.version;

const byVersionAscending = (
	left: CatalogVariantVersionPreview,
	right: CatalogVariantVersionPreview,
) => left.version - right.version;

const findVariantUpsert = ({
	upsertProducts,
	planId,
	version,
}: {
	upsertProducts: UpsertProductPlan[];
	planId: string;
	version: number;
}): UpsertProductPlan | undefined =>
	upsertProducts.find(
		(upsert) => upsert.row.planId === planId && upsert.row.version === version,
	);

const resolveVariantAction = ({
	variantPlanId,
	version,
	previewVersion,
	base,
}: {
	variantPlanId: string;
	version: number;
	previewVersion: number;
	base: UpsertProductPlan;
}): CatalogVariantAction => {
	const versionIsTargeted = ({
		targetVersion,
	}: {
		targetVersion: number | undefined;
	}) => {
		if (targetVersion !== undefined) return targetVersion === version;
		if (base.row.versioning === "all_versions") return true;
		return version === previewVersion;
	};
	if (
		base.declaredVariants?.some(
			(declared) =>
				declared.variant_plan_id === variantPlanId &&
				(declared.customize !== undefined || declared.archived !== undefined) &&
				versionIsTargeted({ targetVersion: declared.version }),
		)
	) {
		return "explicit";
	}
	if (
		base.propagate?.variants?.some(
			(target) =>
				target.plan_id === variantPlanId &&
				versionIsTargeted({ targetVersion: target.version }),
		)
	) {
		return "propagated";
	}
	return "unchanged";
};

const variantPlanChange = ({
	variantUpsert,
}: {
	variantUpsert: UpsertProductPlan | undefined;
}) =>
	variantUpsert
		? buildPlanChangeFromFullProducts({
				from:
					variantUpsert.row.baseFullProduct ??
					variantUpsert.row.currentFullProduct ??
					undefined,
				to: variantUpsert.row.nextFullProduct,
			})
		: undefined;

const variantPreviewState = ({
	planId,
	version,
	productStatesContext,
	previewContext,
}: {
	planId: string;
	version: number;
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
}) => {
	const variantState = productKeyToState({
		productKey: { planId, version },
		productStatesContext,
	});
	return {
		has_customers: variantState.customerUsage.hasVersionableCustomerProducts,
		will_archive: false,
		usage: customerUsageForPreview({
			planId,
			version,
			previewContext,
		}),
	};
};

const variantVersioningOptions = ({
	variant,
	productStatesContext,
}: {
	variant: FullProduct;
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioningStrategy[] => {
	const state = productKeyToState({
		productKey: { planId: variant.id, version: variant.version },
		productStatesContext,
	});
	return computeVersioningOptionsForPlan({
		hasCustomers: state.customerUsage.hasVersionableCustomerProducts,
		isLatestVersion: true,
		hasMultipleVersions:
			(productStatesContext.versionsByPlanId[variant.id]?.length ?? 0) > 1,
	});
};

const variantVersioning = ({
	variant,
	mintUpsert,
	base,
	productStatesContext,
}: {
	variant: FullProduct;
	mintUpsert: UpsertProductPlan | undefined;
	base: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioning => {
	const target = base.propagate?.variants?.find(
		(candidate) => candidate.plan_id === variant.id,
	);
	const resolved = mintUpsert
		? ("new_version" as const)
		: target?.version !== undefined
			? ("existing" as const)
			: base.row.versioning === "all_versions"
				? ("all_versions" as const)
				: ("existing" as const);

	return {
		current_version: variant.version,
		new_version: mintUpsert?.row.version ?? null,
		resolved,
		options: variantVersioningOptions({ variant, productStatesContext }),
	};
};

/** Every other existing version that could receive this base edit. */
const siblingVersionsForVariant = ({
	variant,
	upsertProducts,
	productStatesContext,
	previewContext,
	editedCurrent,
	editedNext,
	previewVersion,
	base,
}: {
	variant: FullProduct;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
	editedCurrent: FullProduct | null;
	editedNext: FullProduct;
	previewVersion: number;
	base: UpsertProductPlan;
}): CatalogVariantVersionPreview[] =>
	(productStatesContext.versionsByPlanId[variant.id] ?? [])
		.filter((product) => product.version !== previewVersion)
		.map((product) => {
			const siblingUpsert = findVariantUpsert({
				upsertProducts,
				planId: product.id,
				version: product.version,
			});
			const siblingAction = resolveVariantAction({
				variantPlanId: variant.id,
				version: product.version,
				previewVersion,
				base,
			});
			const planChange = variantPlanChange({ variantUpsert: siblingUpsert });
			const preview: CatalogVariantVersionPreview = {
				...catalogRowIdentity({
					planId: product.id,
					version: product.version,
					current: product,
					next: siblingUpsert?.row.nextFullProduct ?? product,
				}),
				state: variantPreviewState({
					planId: product.id,
					version: product.version,
					productStatesContext,
					previewContext,
				}),
				variant_action: siblingAction,
				...(planChange ? { plan_change: planChange } : {}),
			};
			if (siblingAction === "explicit") return preview;
			return withVariantConflicts({
				preview,
				current: editedCurrent,
				next: editedNext,
				relative: product,
			});
		})
		.sort(byVersionAscending);

/** Latest variants of this base. Empty → omit the lane. */
export const buildVariantsPreview = ({
	directUpsert,
	upsertProducts,
	productStatesContext,
	previewContext,
	renamePlans,
}: {
	directUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
	renamePlans: RenameProductPlan[];
}): CatalogVariantPreview[] => {
	const variants = latestVariantsOfBase({
		upsert: directUpsert,
		productStatesContext,
	});
	if (variants.length === 0) return [];

	const editedCurrent = directUpsert.row.currentFullProduct;
	const editedNext = directUpsert.row.nextFullProduct;

	return variants
		.map((variant) => {
			const mintUpsert = findVariantUpsert({
				upsertProducts,
				planId: variant.id,
				version: variant.version + 1,
			});
			const variantUpsert =
				mintUpsert ??
				findVariantUpsert({
					upsertProducts,
					planId: variant.id,
					version: variant.version,
				});
			const previewVersion = mintUpsert?.row.version ?? variant.version;
			const variantAction = resolveVariantAction({
				variantPlanId: variant.id,
				version: previewVersion,
				previewVersion,
				base: directUpsert,
			});
			const planChange = variantPlanChange({ variantUpsert });
			const aliasReplacement = aliasReplacementForPlan({
				planId: variant.id,
				upsert: variantUpsert,
				renamePlans,
			});
			const siblingVersions = siblingVersionsForVariant({
				variant,
				upsertProducts,
				productStatesContext,
				previewContext,
				editedCurrent,
				editedNext,
				previewVersion,
				base: directUpsert,
			});
			const preview = {
				...catalogRowIdentity({
					planId: variant.id,
					version: previewVersion,
					current: mintUpsert ? null : variant,
					next: variantUpsert?.row.nextFullProduct ?? variant,
				}),
				versioning: variantVersioning({
					variant,
					mintUpsert,
					base: directUpsert,
					productStatesContext,
				}),
				state: variantPreviewState({
					planId: variant.id,
					version: variant.version,
					productStatesContext,
					previewContext,
				}),
				variant_action: variantAction,
				...(planChange ? { plan_change: planChange } : {}),
				...(siblingVersions.length > 0
					? { sibling_versions: siblingVersions }
					: {}),
				...(aliasReplacement ? { alias_replacement: aliasReplacement } : {}),
			};
			if (variantAction === "explicit") return preview;
			return withVariantConflicts({
				preview,
				current: editedCurrent,
				next: editedNext,
				// Pre-edit variant. Follow's next already applied the diff.
				relative: variant,
			});
		})
		.sort(byPlanThenVersion);
};
