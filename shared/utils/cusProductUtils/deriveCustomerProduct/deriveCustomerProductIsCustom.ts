import type { FullCusProduct } from "@models/cusProductModels/cusProductModels.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import type { FullProduct } from "@models/productModels/productModels.js";
import { productsAreSame } from "../../productV2Utils/compareProductUtils/compareProductUtils.js";
import { cusProductToProduct } from "../convertCusProduct.js";

/**
 * Is this customer product a customized version of the plan it points at?
 *
 * Derived by comparing the customer's own price and entitlement rows against
 * the catalog version the row references — never taken from request input.
 *
 * Deliberately compares ITEMS ONLY:
 * - Free trial is excluded. A longer trial for one customer is not a custom
 *   plan, and trials are inherited (not re-read from catalog) across version
 *   changes, so those customers stay intact without the flag.
 * - Plan licenses are excluded. Known gap: a customer whose only divergence is
 *   seat-related reads as non-custom. Matches existing behaviour — the flag has
 *   never covered licenses — so this is a gap left open, not one introduced.
 * - Product details, config, metadata and billing controls are excluded because
 *   they are columns on the product row the customer product already points at,
 *   making the comparison tautological.
 * - Feature quantities (prepaid amounts) are excluded: buying more of something
 *   is usage, not customization.
 *
 * Biased towards `true`. A false positive only means the customer is skipped by
 * version migrations; a false negative lets a migration overwrite genuinely
 * customized prices and entitlements.
 */
export const deriveCustomerProductIsCustom = ({
	customerProduct,
	baseProduct,
	features,
}: {
	customerProduct: FullCusProduct;
	/** The catalog version `customerProduct.internal_product_id` points at,
	 * loaded with custom rows excluded. Nullish when it could not be resolved. */
	baseProduct?: FullProduct | null;
	features: Feature[];
}): boolean => {
	// Cannot prove it matches the catalog, so assume it does not.
	if (!baseProduct) return true;

	try {
		const { itemsSame } = productsAreSame({
			curProductV1: baseProduct,
			newProductV1: cusProductToProduct({ cusProduct: customerProduct }),
			features,
		});

		return !itemsSame;
	} catch {
		return true;
	}
};
