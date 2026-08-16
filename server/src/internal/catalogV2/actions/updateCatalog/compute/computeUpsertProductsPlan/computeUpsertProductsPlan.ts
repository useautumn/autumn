import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computePlanLicensesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/computePlanLicensesPlan";
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
 * Derive direct intents → fold each → deriveIntents onto the same pending list.
 * First claim wins. planLicenses compute last, once all plan content is final.
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
	const allVersionsPlanIds = new Set(
		pendingIntents
			.filter((intent) => intent.planParams.versioning === "all_versions")
			.map((intent) => intent.productKey.planId),
	);

	const fold = createProductStatesFold({ original: productStatesContext });
	const upsertProducts: UpsertProductPlan[] = [];

	// Apply each plan's own changes: direct entries plus derived versions/variants.
	for (const intent of pendingIntents) {
		const upsert = computeUpsertProductPlan({
			ctx,
			productKey: intent.productKey,
			planParams: intent.planParams,
			source: intent.source,
			productStatesContext: fold.projected,
			editDiff: intent.editDiff,
		});

		upsertProducts.push(upsert);
		fold.advance({ upsert });

		pendingIntents.push(
			...deriveIntents({
				intent,
				upsert,
				projectedProductStatesContext: fold.projected,
				claimedProductKeys,
				allVersionsPlanIds,
			}),
		);
	}

	// planLicenses read other plans' results, so they compute once every plan has.
	const upsertProductsWithPlanLicenses = computePlanLicensesPlan({
		ctx,
		upsertProducts,
		productStatesContext: fold.projected,
		licenseStatesContext: catalogContext.licenseStatesContext,
	});

	return { upsertProducts: upsertProductsWithPlanLicenses };
};
