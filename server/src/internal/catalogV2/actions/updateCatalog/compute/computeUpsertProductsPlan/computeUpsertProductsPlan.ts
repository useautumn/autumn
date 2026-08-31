import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computePlanLicensesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/computePlanLicensesPlan";
import { computeUpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductPlan/computeUpsertProductPlan";
import { indexDeclaredVariants } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/shouldUnlinkDirectVariant";
import { deriveDirectIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveDirectIntents";
import { deriveIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveIntents";
import { mergeDeclaredProcessors } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/mergeDeclaredProcessors";
import type { CatalogComputeStep } from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import {
	claimProductKeys,
	type UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { createProductStatesFold } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/createProductStatesFold";

/**
 * Derive direct intents → merge stated processors across each lineage → fold
 * each → deriveIntents onto the same pending list. First claim wins, so the
 * merge has to land before every direct intent is claimed. planLicenses
 * compute last, once all plan content is final.
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
	const { productStatesContext, internalIdRefs } = catalogContext;

	// A row the payload named is claimed before the fold, so the derived
	// mapping fan-out can never reach it — fill it in up front instead.
	const pendingIntents = mergeDeclaredProcessors({
		intents: deriveDirectIntents({
			params,
			productStatesContext,
			internalIdRefs,
		}),
		params,
		productStatesContext,
		internalIdRefs,
	});
	const declaredVariants = indexDeclaredVariants({
		plans: params.plans,
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
		const { targetProductPlan, upsertProductPlans } = computeUpsertProductPlan({
			ctx,
			intent,
			productStatesContext: fold.projected,
			claimedProductKeys,
			declaredVariants,
		});

		for (const upsert of upsertProductPlans) {
			upsertProducts.push(upsert);
			fold.advance({ upsert });
		}

		pendingIntents.push(
			...deriveIntents({
				intent,
				upsert: targetProductPlan,
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
