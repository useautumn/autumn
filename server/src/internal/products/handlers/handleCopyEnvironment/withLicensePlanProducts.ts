import { deduplicateArray, type FullProduct } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";

/**
 * Pulls the copy set's license plans into it unless the target already has a
 * plan with that id, so a copied parent never lands without its licenses.
 */
export const withLicensePlanProducts = async ({
	db,
	fromProducts,
	fromProductsAll,
	toProducts,
}: {
	db: DrizzleCli;
	fromProducts: FullProduct[];
	fromProductsAll: FullProduct[];
	toProducts: FullProduct[];
}): Promise<FullProduct[]> => {
	const links = await planLicenseRepo.listWithLicensePlanIdByParents({
		db,
		parentInternalProductIds: fromProducts.map(
			(product) => product.internal_id,
		),
	});
	if (links.length === 0) return fromProducts;

	const includedIds = new Set(fromProducts.map((product) => product.id));
	const targetIds = new Set(toProducts.map((product) => product.id));

	const licensePlans: FullProduct[] = [];
	for (const licensePlanId of deduplicateArray(
		links.map((link) => link.licensePlanId),
	)) {
		if (includedIds.has(licensePlanId) || targetIds.has(licensePlanId)) {
			continue;
		}
		const licensePlan = fromProductsAll.find(
			(product) => product.id === licensePlanId,
		);
		if (!licensePlan) continue;

		licensePlans.push(licensePlan);
		includedIds.add(licensePlanId);
	}

	return [...fromProducts, ...licensePlans];
};
