import type {
	CatalogVariantAction,
	CatalogVariantPreview,
	FullProduct,
} from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { latestVariantsOfBase } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/variantPlanUtils";
import { withVariantConflicts } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/conflicts/withVariantConflicts";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

const byPlanThenVersion = (
	left: CatalogVariantPreview,
	right: CatalogVariantPreview,
) => left.plan_id.localeCompare(right.plan_id) || left.version - right.version;

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
		(upsert) =>
			upsert.row.planId === planId && upsert.row.version === version,
	);

const resolveVariantAction = ({
	variant,
	base,
}: {
	variant: FullProduct;
	base: UpsertProductPlan;
}): CatalogVariantAction => {
	if (
		base.declaredVariants?.some(
			(declared) =>
				declared.variant_plan_id === variant.id && declared.customize,
		)
	) {
		return "explicit";
	}
	if (
		base.propagate?.variants?.some((target) => target.plan_id === variant.id)
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

/** Latest variants of this base. Empty → omit the lane. */
export const buildVariantsPreview = ({
	directUpsert,
	upsertProducts,
	productStatesContext,
}: {
	directUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
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
			const variantState = productKeyToState({
				productKey: { planId: variant.id, version: variant.version },
				productStatesContext,
			});
			const variantAction = resolveVariantAction({
				variant,
				base: directUpsert,
			});
			const planChange = variantPlanChange({ variantUpsert });
			const preview = {
				plan_id: variant.id,
				version: previewVersion,
				state: {
					has_customers:
						variantState.customerUsage.hasVersionableCustomerProducts,
					will_archive: false,
				},
				variant_action: variantAction,
				...(planChange ? { plan_change: planChange } : {}),
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
