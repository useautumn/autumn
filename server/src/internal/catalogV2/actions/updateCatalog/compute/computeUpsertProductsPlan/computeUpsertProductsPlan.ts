import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductPlan";
import { deriveDirectIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveDirectIntents";
import { deriveIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveIntents";
import type { CatalogComputeStep } from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import {
	claimProductKeys,
	type UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { createProductStatesFold } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/createProductStatesFold";

/**
 * Derive direct intents → fold each → deriveIntents (versions / variants /
 * license parents) onto the same pending list. First claim wins.
 */
export const computeUpsertProductsPlan = ({
	ctx,
	catalogContext,
	params,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	params: UpdateCatalogParams;
}): CatalogComputeStep => {
	const { productStatesContext } = catalogContext;

	const pendingIntents = deriveDirectIntents({
		params,
		productStatesContext,
	});
	const claimedProductKeys = claimProductKeys({ intents: pendingIntents });

	const fold = createProductStatesFold({ original: productStatesContext });
	const upsertProducts: UpsertProductPlan[] = [];

	for (const intent of pendingIntents) {
		const upsert = computeUpsertProductPlan({
			ctx,
			productKey: intent.productKey,
			planParams: intent.planParams,
			source: intent.source,
			productStatesContext: fold.projected,
		});

		upsertProducts.push(upsert);
		fold.advance({ upsert });

		pendingIntents.push(
			...deriveIntents({
				intent,
				upsert,
				projectedProductStatesContext: fold.projected,
				claimedProductKeys,
			}),
		);
	}

	return { upsertProducts };
};
