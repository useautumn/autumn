import { productKeyToString, productToProductKey } from "@autumn/shared";
import { deriveLicenseParentMintIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveLicenseParentMintIntents";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Links-only pin for parent versions not already in the batch. Skip all_versions plans — siblings cover them. */
export const deriveLicenseParentIntents = ({
	upsert,
	projectedProductStatesContext,
	allVersionsPlanIds,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
	allVersionsPlanIds: Set<string>;
}): ProductUpsertIntent[] => {
	if (!upsert.entitlementPricesPlan) return [];

	const reverseLinks =
		upsert.row.currentFullProduct?.parent_plan_licenses ??
		upsert.row.baseFullProduct?.parent_plan_licenses ??
		[];

	return [
		...deriveLicenseParentMintIntents({
			upsert,
			productStatesContext: projectedProductStatesContext,
		}),
		...reverseLinks.flatMap((link) => {
			const productKey = productToProductKey({ product: link.product });
			if (allVersionsPlanIds.has(productKey.planId)) return [];
			const parentIsLoaded =
				projectedProductStatesContext.statesByPlanVersion[
					productKeyToString({ productKey })
				] !== undefined;
			if (!parentIsLoaded) return [];

			return [
				{
					productKey,
					planParams: {
						plan_id: productKey.planId,
						version: productKey.version,
					},
					source: "license_pin" as const,
				},
			];
		}),
	];
};
