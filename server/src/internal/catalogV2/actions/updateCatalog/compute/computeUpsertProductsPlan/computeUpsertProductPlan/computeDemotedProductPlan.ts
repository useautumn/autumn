import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { intentToUpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductPlan/intentToUpsertProductPlan";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import {
	claimNewIntents,
	type UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";

/** The product that currently holds `active`, as an upsert that sets `active: false`. */
export const computeDemotedProductPlan = ({
	ctx,
	targetProductPlan,
	productStatesContext,
	claimedProductKeys,
}: {
	ctx: AutumnContext;
	targetProductPlan: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
	claimedProductKeys: Set<string>;
}): UpsertProductPlan | undefined => {
	if (!targetProductPlan.previousActiveInternalId) return undefined;

	const currentActive = findFullProductByInternalId({
		internalId: targetProductPlan.previousActiveInternalId,
		productStatesContext,
	});
	if (!currentActive) return undefined;

	const handsOffDefault =
		currentActive.is_default &&
		targetProductPlan.row.nextFullProduct.is_default;
	const [intent] = claimNewIntents({
		intents: [
			{
				productKey: {
					planId: currentActive.id,
					version: currentActive.version,
				},
				planParams: {
					plan_id: currentActive.id,
					version: currentActive.version,
					active: false,
					...(handsOffDefault ? { is_default: false } : {}),
				},
				source: "demoted_product",
			},
		],
		claimedProductKeys,
	});
	if (!intent) return undefined;

	return intentToUpsertProductPlan({ ctx, intent, productStatesContext });
};
