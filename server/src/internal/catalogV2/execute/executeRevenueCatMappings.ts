import {
	type ApiRevenueCatPlanProcessor,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

type StatedRevenueCatMapping = {
	planId: string;
	processor: ApiRevenueCatPlanProcessor | null;
};

const statedRevenueCatMappings = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): StatedRevenueCatMapping[] =>
	updateCatalogPlan.upsertProducts.flatMap((upsert) => {
		const processor = upsert.revenuecatProcessor;
		if (processor === undefined) return [];
		return [{ planId: upsert.row.nextFullProduct.id, processor }];
	});

const ownedPlanIds = ({
	stated,
	updateCatalogPlan,
}: {
	stated: StatedRevenueCatMapping[];
	updateCatalogPlan: UpdateCatalogPlan;
}): Set<string> => {
	const owned = new Set(stated.map((entry) => entry.planId));
	for (const { planId, toId } of updateCatalogPlan.renamePlans) {
		if (owned.has(toId)) owned.add(planId);
	}
	return owned;
};

export const assertRevenueCatIdsUnclaimed = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	const stated = statedRevenueCatMappings({ updateCatalogPlan });
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

	const owned = ownedPlanIds({ stated, updateCatalogPlan });
	const existing = await RCMappingService.getAll({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	for (const row of existing) {
		if (owned.has(row.autumn_product_id)) continue;
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

export const executeRevenueCatMappings = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	const stated = statedRevenueCatMappings({ updateCatalogPlan });
	if (stated.length === 0) return;

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
