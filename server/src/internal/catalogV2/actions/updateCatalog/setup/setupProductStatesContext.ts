import type { FullProduct, UpdateCatalogParams } from "@autumn/shared";
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
		]),
	),
];

const licenseParentPlanIds = ({
	products,
	loadedPlanIds,
}: {
	products: FullProduct[];
	loadedPlanIds: string[];
}): string[] => [
	...new Set(
		products.flatMap((product) =>
			(product.parent_plan_licenses ?? []).map((link) => link.product.id),
		),
	),
].filter((planId) => !loadedPlanIds.includes(planId));

/**
 * Batch-load every plan_id (and new_plan_id) in the payload, declared license
 * children, and reverse license-parent plans of touched children.
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

	const listAllVersions = async ({ planIds }: { planIds: string[] }) => {
		if (planIds.length === 0) return [];
		return ProductService.listFull({
			db,
			orgId: org.id,
			env,
			inIds: planIds,
			returnAll: true,
			skipCache: true,
		});
	};

	const loadedPlanIds = payloadPlanIds({ planEntries });
	const payloadVersions = await listAllVersions({ planIds: loadedPlanIds });
	const parentPlanIds = licenseParentPlanIds({
		products: payloadVersions,
		loadedPlanIds,
	});
	const parentVersions = await listAllVersions({ planIds: parentPlanIds });

	const allPlanIds = [...loadedPlanIds, ...parentPlanIds];
	const allVersions = [...payloadVersions, ...parentVersions];

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
