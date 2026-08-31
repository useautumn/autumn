import { productKeyToString, productToProductKey } from "@autumn/shared";
import {
	childEditsItemsInPlace,
	childTriggersLicenseRewrite,
	movesActivePointer,
	reverseLinksForChild,
	reverseLinksOnChildPlan,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import { deriveLicenseParentMintIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveLicenseParentMintIntents";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/**
 * Pull absent parent versions into the batch. In-place edits pull every
 * reverse-linked parent (pin candidates); mints/promotes pull only parents
 * listed in propagate — anchored links stay untouched. Skip all_versions
 * plans — siblings cover them.
 */
export const deriveLicenseParentIntents = ({
	intent,
	upsert,
	projectedProductStatesContext,
	allVersionsPlanIds,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
	allVersionsPlanIds: Set<string>;
}): ProductUpsertIntent[] => {
	const rewritesLicenses = childTriggersLicenseRewrite({ child: upsert });
	if (!rewritesLicenses) return [];

	const editsInPlace = childEditsItemsInPlace({ child: upsert });
	const propagatePlanIds = new Set(
		(upsert.propagate?.license_parents ?? []).map((target) => target.plan_id),
	);
	const reverseLinks = movesActivePointer({ upsert })
		? reverseLinksOnChildPlan({
				planId: upsert.row.planId,
				productStatesContext: projectedProductStatesContext,
			})
		: reverseLinksForChild({
				upsert,
				productStatesContext: projectedProductStatesContext,
			});

	return [
		...deriveLicenseParentMintIntents({
			intent,
			upsert,
			productStatesContext: projectedProductStatesContext,
		}),
		...reverseLinks.flatMap((link) => {
			const productKey = productToProductKey({ product: link.product });
			if (allVersionsPlanIds.has(productKey.planId)) return [];
			if (!editsInPlace && !propagatePlanIds.has(productKey.planId))
				return [];
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
