import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	emptyProductStatesContext,
	type ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { buildProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/buildProductStatesContext";
import { groupProductsByPlanId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/groupProductsByPlanId";
import { indexRewardProgramsByPlanId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/indexRewardProgramsByPlanId";
import { getVersioningUsage } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { rewardProgramRepo } from "@/internal/rewards/repos/index.js";

/**
 * Batch-load every plan_id in the payload: all versions as FullProduct
 * (base/variants + licenses hydrated), per-row customer usage, and reward
 * programs for rename gates. Row targeting happens in compute's expand step.
 */
export const setupProductStatesContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): Promise<ProductStatesContext> => {
	const { db, org, env } = ctx;
	const planEntries = params.plans;
	if (planEntries.length === 0) return emptyProductStatesContext();

	const allPlanIds = [...new Set(planEntries.map((entry) => entry.plan_id))];

	const allVersions = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		inIds: allPlanIds,
		returnAll: true,
		skipCache: true,
	});

	const [usageByInternalId, rewardPrograms] = await Promise.all([
		getVersioningUsage({
			db,
			internalProductIds: allVersions.map((product) => product.internal_id),
		}),
		rewardProgramRepo.getByProductId({
			db,
			productIds: allPlanIds,
			orgId: org.id,
			env,
		}),
	]);

	return buildProductStatesContext({
		planIds: allPlanIds,
		versionsByPlanId: groupProductsByPlanId({ products: allVersions }),
		usageByInternalId,
		rewardProgramsByPlanId: indexRewardProgramsByPlanId({ rewardPrograms }),
	});
};
