import { productToProductKey } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { latestVariantsOfBase } from "../variantPlanUtils";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";

/** Existing standalone (or other-base) ids in variants[] → stamp the pointer. */
export const deriveVariantAdopts = ({
	upsert,
	projectedProductStatesContext,
}: {
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	const alreadyThisBase = new Set(
		latestVariantsOfBase({
			upsert,
			productStatesContext: projectedProductStatesContext,
			includeArchived: true,
		}).map((product) => product.id),
	);
	const parentInternalId = upsert.row.nextFullProduct.internal_id;

	return (upsert.declaredVariants ?? []).flatMap((variant): ProductUpsertIntent[] => {
		const versions =
			projectedProductStatesContext.versionsByPlanId[variant.variant_plan_id] ??
			[];
		if (versions.length === 0) return [];
		if (
			!activeFullProductForPlan({
				planId: variant.variant_plan_id,
				productStatesContext: projectedProductStatesContext,
			})
		) {
			return [];
		}

		if (variant.base_variant_id === null) {
			return versions.map((product) => ({
				productKey: productToProductKey({ product }),
				planParams: {
					plan_id: product.id,
					version: product.version,
					base_variant_id: null,
				},
				source: "repoint" as const,
				unlink: true,
			}));
		}

		if (alreadyThisBase.has(variant.variant_plan_id)) return [];

		return versions.map((product) => ({
			productKey: productToProductKey({ product }),
			planParams: {
				plan_id: product.id,
				version: product.version,
			},
			source: "repoint" as const,
			baseInternalProductId: parentInternalId,
		}));
	});
};
