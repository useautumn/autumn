import type { FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	type BaseProductCache,
	loadCachedBaseProduct,
} from "./loadBaseProduct";

const needsBaseProduct = (
	customerLicense: NonNullable<FullCusProduct["customer_licenses"]>[number],
) =>
	Boolean(
		customerLicense.planLicense?.customized &&
			!customerLicense.planLicense.base_product,
	);

/** Stored licenses carry only their effective product, so a customised one needs its catalog product to compare. */
export const withLicenseBaseProducts = async ({
	ctx,
	customerProduct,
	baseProducts,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	baseProducts: BaseProductCache;
}): Promise<FullCusProduct | null> => {
	const customerLicenses = customerProduct.customer_licenses ?? [];
	if (!customerLicenses.some(needsBaseProduct)) return customerProduct;

	const hydrated = await Promise.all(
		customerLicenses.map(async (customerLicense) => {
			const planLicense = customerLicense.planLicense;
			if (!planLicense || !needsBaseProduct(customerLicense))
				return customerLicense;

			const baseProduct = await loadCachedBaseProduct({
				ctx,
				internalProductId: planLicense.product.internal_id,
				baseProducts,
			});
			if (!baseProduct) return null;

			const { licenses: _licenses, ...baseWithoutLicenses } = baseProduct;
			return {
				...customerLicense,
				planLicense: { ...planLicense, base_product: baseWithoutLicenses },
			};
		}),
	);
	if (hydrated.includes(null)) return null;
	return {
		...customerProduct,
		customer_licenses: hydrated.filter((license) => license !== null),
	};
};
