import { deduplicateArray, type ProductV2 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTargetBaseInternalIds } from "./resolveVariantBaseLinks.js";
import { upsertCopiedPlan } from "./upsertCopiedPlan.js";

/**
 * Copies the set's variants into the target env, each linked to its base
 * resolved there. A variant whose base can't resolve copies unlinked with a
 * warning rather than failing the whole copy.
 */
export const copyEnvVariantPlans = async ({
	toContext,
	variantProductsV2,
	basePlanIdByVariantId,
	targetIds,
}: {
	toContext: AutumnContext;
	variantProductsV2: ProductV2[];
	basePlanIdByVariantId: Map<string, string>;
	targetIds: Set<string>;
}): Promise<void> => {
	if (variantProductsV2.length === 0) return;

	const targetBaseInternalIds = await getTargetBaseInternalIds({
		toContext,
		basePlanIds: deduplicateArray([...basePlanIdByVariantId.values()]),
	});

	await Promise.all(
		variantProductsV2.map((fromProductV2) => {
			const basePlanId = basePlanIdByVariantId.get(fromProductV2.id);
			const targetBaseInternalId = basePlanId
				? targetBaseInternalIds.get(basePlanId)
				: undefined;

			if (!basePlanId || !targetBaseInternalId) {
				toContext.logger.warn(
					basePlanId
						? `copy env: target ${basePlanId} cannot be a variant base, copying ${fromProductV2.id} unlinked`
						: `copy env: ${fromProductV2.id} has no resolved base, copying unlinked`,
				);
				return upsertCopiedPlan({ toContext, fromProductV2, targetIds });
			}

			return upsertCopiedPlan({
				toContext,
				fromProductV2,
				targetIds,
				targetBase: { planId: basePlanId, internalId: targetBaseInternalId },
			});
		}),
	);
};
