import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	type CatalogPhases,
	timeCatalogPhase,
} from "@/internal/catalogV2/actions/updateCatalog/setup/timeCatalogPhase";
import {
	emptyProductStatesContext,
	type ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { buildProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/buildProductStatesContext";
import { collectProductStateRows } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/collectProductStateRows";
import { groupProductsByPlanId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/groupProductsByPlanId";
import { indexRewardProgramsByPlanId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/indexRewardProgramsByPlanId";
import type { VersioningRowRefTargets } from "@/internal/customers/cusProducts/repos/getBoundedVersionableRowRefs.js";
import { getVersioningFlags } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { rewardProgramRepo } from "@/internal/rewards/repos/index.js";

const payloadPlanIds = ({
	params,
}: {
	params: UpdateCatalogParams;
}): string[] => [
	...new Set([
		...params.plans.flatMap((entry) => [
			entry.plan_id,
			...(entry.new_plan_id ? [entry.new_plan_id] : []),
			...(typeof entry.base_variant_id === "string"
				? [entry.base_variant_id]
				: []),
			...(entry.licenses?.map((license) => license.license_plan_id) ?? []),
			...(entry.variants?.flatMap((variant) => [
				variant.variant_plan_id,
				...(typeof variant.base_variant_id === "string"
					? [variant.base_variant_id]
					: []),
			]) ?? []),
			...(entry.propagate?.variants?.map((target) => target.plan_id) ?? []),
			...(entry.propagate?.license_parents?.map((target) => target.plan_id) ??
				[]),
		]),
		...params.remove_plans.map((entry) => entry.plan_id),
	]),
];

/**
 * One listFull of payload plan ids, then flatten nested parents and variants.
 */
export const setupProductStatesContext = async ({
	ctx,
	params,
	phases,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	phases: CatalogPhases;
}): Promise<ProductStatesContext> => {
	const { db, org, env } = ctx;
	const loadedPlanIds = payloadPlanIds({ params });
	if (loadedPlanIds.length === 0) return emptyProductStatesContext();

	const payloadVersions = await timeCatalogPhase({
		ctx,
		phases,
		phase: "list_full",
		run: () =>
			ProductService.listFull({
				db,
				orgId: org.id,
				env,
				inIds: loadedPlanIds,
				returnAll: true,
				skipCache: true,
			}),
	});
	const allVersions = collectProductStateRows({
		products: payloadVersions,
		payloadPlanIds: loadedPlanIds,
	});
	const allPlanIds = [
		...new Set([...loadedPlanIds, ...allVersions.map((product) => product.id)]),
	];
	const rowRefTargets = {
		entitlements: allVersions.flatMap((product) =>
			product.entitlements.map((entitlement) => ({
				id: entitlement.id,
				internal_product_id: product.internal_id,
			})),
		),
		prices: allVersions.flatMap((product) =>
			product.prices.map((price) => ({
				id: price.id,
				internal_product_id: product.internal_id,
			})),
		),
	} satisfies VersioningRowRefTargets;

	const [usageByInternalId, rewardPrograms] = await Promise.all([
		getVersioningFlags({
			db,
			internalProductIds: allVersions.map((product) => product.internal_id),
			rowRefTargets,
			timePhase: ({ phase, run }) =>
				timeCatalogPhase({ ctx, phases, phase, run }),
		}),
		timeCatalogPhase({
			ctx,
			phases,
			phase: "reward_programs",
			run: () =>
				rewardProgramRepo.getByProductId({
					db,
					productIds: allPlanIds,
					orgId: org.id,
					env,
				}),
		}),
	]);

	return buildProductStatesContext({
		planIds: allPlanIds,
		versionsByPlanId: groupProductsByPlanId({ products: allVersions }),
		usageByInternalId,
		rewardProgramsByPlanId: indexRewardProgramsByPlanId({ rewardPrograms }),
	});
};
