import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deriveStoredCustomerProductIsCustom } from "./deriveStoredCustomerProductIsCustom.js";
import { isDefinitiveIsCustomResult } from "./isDefinitiveIsCustomResult.js";
import type { BaseProductCache } from "./loadBaseProduct.js";

export type IsCustomCorrection = { stored: FullCusProduct; to: boolean };

/** Guesses keep the stored flag, since they are never written either. */
export const fullCustomerWithDerivedIsCustom = async ({
	ctx,
	fullCustomer,
	baseProducts = new Map(),
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	baseProducts?: BaseProductCache;
}): Promise<{
	fullCustomer: FullCustomer;
	corrections: IsCustomCorrection[];
}> => {
	const corrections: IsCustomCorrection[] = [];
	const derivedProducts = await Promise.all(
		fullCustomer.customer_products.map(async (customerProduct) => {
			const result = await deriveStoredCustomerProductIsCustom({
				ctx,
				customerProduct,
				baseProducts,
			});
			if (!isDefinitiveIsCustomResult({ result })) return customerProduct;
			if (result.isCustom !== customerProduct.is_custom) {
				corrections.push({ stored: customerProduct, to: result.isCustom });
			}
			return { ...customerProduct, is_custom: result.isCustom };
		}),
	);

	return {
		fullCustomer: { ...fullCustomer, customer_products: derivedProducts },
		corrections,
	};
};
