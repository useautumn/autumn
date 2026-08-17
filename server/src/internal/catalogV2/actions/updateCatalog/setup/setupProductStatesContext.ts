import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	emptyProductStatesContext,
	type ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { buildProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/buildProductStatesContext";
import { collectProductStateRows } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/collectProductStateRows";
import { groupProductsByPlanId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/groupProductsByPlanId";
import { indexRewardProgramsByPlanId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/indexRewardProgramsByPlanId";
import { getVersioningUsage } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { rewardProgramRepo } from "@/internal/rewards/repos/index.js";

const payloadPlanIds = ({
	planEntries,
}: {
	planEntries: UpdateCatalogParams["plans"];
}): string[] => [
	...new Set(
		planEntries.flatMap((entry) => [
			entry.plan_id,
			...(entry.new_plan_id ? [entry.new_plan_id] : []),
			...(entry.licenses?.map((license) => license.license_plan_id) ?? []),
			...(entry.variants?.map((variant) => variant.variant_plan_id) ?? []),
			...(entry.propagate?.variants?.map((target) => target.plan_id) ?? []),
			...(entry.propagate?.license_parents?.map((target) => target.plan_id) ??
				[]),
		]),
	),
];

/**
 * One listFull of payload plan ids, then flatten nested parents and variants.
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

	const loadedPlanIds = payloadPlanIds({ planEntries });
	if (loadedPlanIds.length === 0) return emptyProductStatesContext();

	const payloadVersions = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		inIds: loadedPlanIds,
		returnAll: true,
		skipCache: true,
	});
	const allVersions = collectProductStateRows({
		products: payloadVersions,
		payloadPlanIds: loadedPlanIds,
	});
	const allPlanIds = [
		...new Set([...loadedPlanIds, ...allVersions.map((product) => product.id)]),
	];

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
