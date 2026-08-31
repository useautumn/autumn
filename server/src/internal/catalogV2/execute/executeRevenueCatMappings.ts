import {
	type ApiRevenueCatPlanProcessor,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

type StatedMapping = {
	planId: string;
	processor: ApiRevenueCatPlanProcessor | null;
};

/**
 * RevenueCat mappings are plan-wide — the table has no version column — so only
 * the addressed row writes and version siblings are ignored.
 */
const statedMappings = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): StatedMapping[] =>
	updateCatalogPlan.upsertProducts.flatMap((upsert) => {
		const processor = upsert.revenuecatProcessor;
		if (processor === undefined) return [];
		return [{ planId: upsert.row.nextFullProduct.id, processor }];
	});

/**
 * A purchase resolves RC id → plan by scanning every mapping, so an id claimed
 * twice would attach whichever row the query happened to return first.
 */
const assertRevenueCatIdsUnclaimed = async ({
	ctx,
	stated,
}: {
	ctx: AutumnContext;
	stated: StatedMapping[];
}) => {
	const claimedHere = new Map<string, string>();
	for (const { planId, processor } of stated) {
		for (const { product_id } of processor?.products ?? []) {
			const owner = claimedHere.get(product_id);
			if (owner && owner !== planId) {
				throw new RecaseError({
					code: ErrCode.InvalidRequest,
					message: `RevenueCat product ${product_id} is mapped to both ${owner} and ${planId}`,
					statusCode: 400,
				});
			}
			claimedHere.set(product_id, planId);
		}
	}
	if (claimedHere.size === 0) return;

	const statedPlanIds = new Set(stated.map((entry) => entry.planId));
	const existing = await RCMappingService.getAll({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	for (const row of existing) {
		// A plan restating its own ids is the normal case, not a collision.
		if (statedPlanIds.has(row.autumn_product_id)) continue;
		for (const productId of row.revenuecat_product_ids) {
			const claimant = claimedHere.get(productId);
			if (!claimant) continue;
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message: `RevenueCat product ${productId} is already mapped to ${row.autumn_product_id}`,
				statusCode: 400,
			});
		}
	}
};

/** Stated `processors.revenuecat` → the mappings table. Omitted keeps, null clears. */
export const executeRevenueCatMappings = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	const stated = statedMappings({ updateCatalogPlan });
	if (stated.length === 0) return;

	await assertRevenueCatIdsUnclaimed({ ctx, stated });

	for (const { planId, processor } of stated) {
		const products = processor?.products ?? [];
		if (products.length === 0) {
			await RCMappingService.delete({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				autumnProductId: planId,
			});
			continue;
		}

		const featureQuantities = Object.fromEntries(
			products
				.filter((product) => product.feature_quantities?.length)
				.map((product) => [product.product_id, product.feature_quantities!]),
		);

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: ctx.env,
				autumn_product_id: planId,
				revenuecat_product_ids: products.map((product) => product.product_id),
				feature_quantities: Object.keys(featureQuantities).length
					? featureQuantities
					: null,
			},
		});
	}
};
