import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deriveStoredCustomerProductIsCustom } from "./deriveStoredCustomerProductIsCustom.js";
import { isDefinitiveIsCustomResult } from "./isDefinitiveIsCustomResult.js";
import type { BaseProductCache } from "./loadBaseProduct.js";

/** Guesses keep the stored flag, since they are never written either. */
export const fullCustomerWithDerivedIsCustom = async ({
	ctx,
	fullCustomer,
	baseProducts = new Map(),
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	baseProducts?: BaseProductCache;
}): Promise<FullCustomer> => {
	const derivedProducts = await Promise.all(
		fullCustomer.customer_products.map(async (customerProduct) => {
			const result = await deriveStoredCustomerProductIsCustom({
				ctx,
				customerProduct,
				baseProducts,
			});
			if (!isDefinitiveIsCustomResult({ result })) return customerProduct;
			return { ...customerProduct, is_custom: result.isCustom };
		}),
	);

	return { ...fullCustomer, customer_products: derivedProducts };
};
