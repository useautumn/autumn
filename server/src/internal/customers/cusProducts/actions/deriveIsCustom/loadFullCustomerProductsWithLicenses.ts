import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { listFullCustomerLicensesByParentIds } from "@/internal/licenses/repos/customerLicenseRepo/listFullCustomerLicensesByParentIds.js";

export const loadFullCustomerProductsWithLicenses = async ({
	ctx,
	customerProductIds,
}: {
	ctx: AutumnContext;
	customerProductIds: string[];
}): Promise<FullCusProduct[]> => {
	const [customerProducts, customerLicenses] = await Promise.all([
		customerProductRepo.listFullByIds({ db: ctx.db, customerProductIds }),
		listFullCustomerLicensesByParentIds({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			parentCustomerProductIds: customerProductIds,
		}),
	]);
	return customerProducts.map((customerProduct) => ({
		...customerProduct,
		customer_licenses: customerLicenses.filter(
			(customerLicense) =>
				customerLicense.parent_customer_product_id === customerProduct.id,
		),
	}));
};
