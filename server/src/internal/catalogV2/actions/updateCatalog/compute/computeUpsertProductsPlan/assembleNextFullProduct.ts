import type { Feature, FreeTrial, FullProduct, Product } from "@autumn/shared";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";

/** Join product stamp + projected prices/ents/trial into the next FullProduct. */
export const assembleNextFullProduct = ({
	product,
	entitlementPricesPlan,
	freeTrial,
	features,
	currentFullProduct,
}: {
	product: Product;
	entitlementPricesPlan?: EntitlementPricesPlan;
	freeTrial: FreeTrial | null;
	features: Feature[];
	currentFullProduct: FullProduct | null;
}): FullProduct => {
	const prices = entitlementPricesPlan
		? entitlementPricesPlan.projected.prices
		: (currentFullProduct?.prices ?? []);
	const entitlements = entitlementPricesPlan
		? getEntsWithFeature({
				ents: entitlementPricesPlan.projected.entitlements,
				features,
			})
		: (currentFullProduct?.entitlements ?? []);

	return {
		...product,
		prices,
		entitlements,
		free_trial: freeTrial,
	} as FullProduct;
};
