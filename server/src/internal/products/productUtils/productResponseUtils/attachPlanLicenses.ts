import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { loadApiPlanLicenses } from "@/internal/licenses/actions/links/loadApiPlanLicenses.js";

/** Populates each product's `licenses` from the catalog so getPlanResponse reads
 * them off the product. Licenses live outside ProductService.getFull to avoid a
 * licenses→ProductService import cycle, so the read handlers attach them here. */
export const attachPlanLicenses = async ({
	ctx,
	products,
}: {
	ctx: AutumnContext;
	products: FullProduct[];
}): Promise<FullProduct[]> => {
	if (products.length === 0) return products;

	const licensesByParent = await loadApiPlanLicenses({
		ctx,
		internalProductIds: products.map((product) => product.internal_id),
	});

	for (const product of products) {
		product.licenses = licensesByParent.get(product.internal_id);
	}
	return products;
};
