import type { FullProduct } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { withPulledInPlans } from "./withPulledInPlans.js";

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

	return withPulledInPlans({
		fromProducts,
		fromProductsAll,
		toProducts,
		planIds: links.map((link) => link.licensePlanId),
	});
};
