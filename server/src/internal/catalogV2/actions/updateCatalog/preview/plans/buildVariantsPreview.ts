import type {
	CatalogPlanVersioning,
	CatalogPlanVersioningStrategy,
	CatalogVariantAction,
	CatalogVariantPreview,
	CatalogVariantVersionPreview,
	FullProduct,
} from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { variantRowsAnchoredTo } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/variantPlanUtils";
import { variantRowForPropagateTarget } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/variantRowForPropagateTarget";
import { catalogRowIdentity } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/catalogRowIdentity";
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

/** Mints land at max+1, which is not active+1 once a plan has an older active row. */
const findVariantMintUpsert = ({
	upsertProducts,
	planId,
}: {
	upsertProducts: UpsertProductPlan[];
	planId: string;
}): UpsertProductPlan | undefined =>
	upsertProducts.find(
		(upsert) =>
			upsert.row.planId === planId &&
			upsert.row.op === "create" &&
			upsert.row.source === "variant_propagation",
	);

const resolveVariantAction = ({
	variantPlanId,
	version,
	previewVersion,
	base,
	productStatesContext,
}: {
	variantPlanId: string;
	version: number;
	previewVersion: number;
	base: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
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
		base.propagate?.variants?.some((target) => {
			if (target.plan_id !== variantPlanId) return false;
			const targetRow = variantRowForPropagateTarget({
				target,
				anchorInternalIds: editedBaseInternalIds({ upsert: base }),
				productStatesContext,
			});
			if (!targetRow) return false;
			return versionIsTargeted({ targetVersion: targetRow.version });
		})
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
	const resolved = mintUpsert
		? ("new_version" as const)
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

/** Other rows of this variant plan anchored to the same base row. */
const siblingVersionsForVariant = ({
	variant,
	anchoredRows,
	upsertProducts,
	productStatesContext,
	previewContext,
	editedCurrent,
	editedNext,
	previewVersion,
	base,
}: {
	variant: FullProduct;
	anchoredRows: FullProduct[];
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
	editedCurrent: FullProduct | null;
	editedNext: FullProduct;
	previewVersion: number;
	base: UpsertProductPlan;
}): CatalogVariantVersionPreview[] =>
	anchoredRows
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
				productStatesContext,
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

/** Base rows this upsert edits — what anchored variant rows must point at. */
const editedBaseInternalIds = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): Set<string> =>
	new Set(
		[
			upsert.row.currentFullProduct?.internal_id,
			upsert.row.baseFullProduct?.internal_id,
			upsert.row.nextFullProduct.internal_id,
			upsert.previousActiveInternalId,
		].filter((internalId): internalId is string => internalId !== undefined),
	);

/** Anchored rows per variant plan: [representative, ...other anchored rows]. */
const anchoredRowsByVariantPlan = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): Map<string, FullProduct[]> => {
	const anchored = variantRowsAnchoredTo({
		baseInternalIds: editedBaseInternalIds({ upsert }),
		productStatesContext,
	});
	const byPlan = new Map<string, FullProduct[]>();
	for (const row of anchored) {
		if (row.id === upsert.row.planId) continue;
		byPlan.set(row.id, [...(byPlan.get(row.id) ?? []), row]);
	}
	for (const [planId, rows] of byPlan) {
		const representative =
			rows.find((row) => row.active) ??
			rows.slice().sort((left, right) => right.version - left.version)[0];
		byPlan.set(planId, [
			representative,
			...rows.filter((row) => row !== representative),
		]);
	}
	return byPlan;
};

/** Variant rows anchored to THIS base row. Empty → omit the lane. */
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
	const anchoredByPlan = anchoredRowsByVariantPlan({
		upsert: directUpsert,
		productStatesContext,
	});
	if (anchoredByPlan.size === 0) return [];

	const editedCurrent = directUpsert.row.currentFullProduct;
	const editedNext = directUpsert.row.nextFullProduct;

	return [...anchoredByPlan.values()]
		.map(([variant, ...anchoredSiblings]) => {
			const mintUpsert = findVariantMintUpsert({
				upsertProducts,
				planId: variant.id,
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
				productStatesContext,
			});
			const planChange = variantPlanChange({ variantUpsert });
			const aliasReplacement = aliasReplacementForPlan({
				planId: variant.id,
				upsert: variantUpsert,
				renamePlans,
			});
			const siblingVersions = siblingVersionsForVariant({
				variant,
				anchoredRows: [variant, ...anchoredSiblings],
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
