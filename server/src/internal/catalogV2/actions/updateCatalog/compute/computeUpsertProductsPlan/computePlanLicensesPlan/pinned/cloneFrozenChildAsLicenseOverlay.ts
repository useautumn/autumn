import { type FullProduct, mapToProductItems } from "@autumn/shared";
import { productItemsToCustomizePlanV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	computeEntitlementPricesPlan,
	type EntitlementPricesPlan,
	entitlementPricesPlanHasWrites,
} from "@/internal/products/actions/computeEntitlementPricesPlan";

/**
 * Mint is_custom overlay rows that copy the frozen child's items/price.
 * No currentRows — claiming stock ids would leak the in-place child edit.
 */
export const cloneFrozenChildAsLicenseOverlay = ({
	ctx,
	frozenChildProduct,
	childProduct,
}: {
	ctx: AutumnContext;
	frozenChildProduct: FullProduct;
	childProduct: FullProduct;
}): EntitlementPricesPlan | undefined => {
	const frozenCustomize = productItemsToCustomizePlanV1({
		ctx,
		items: mapToProductItems({
			prices: frozenChildProduct.prices,
			entitlements: frozenChildProduct.entitlements,
			features: ctx.features,
		}),
	});

	const plan = computeEntitlementPricesPlan({
		ctx,
		params: {
			mode: { type: "custom" },
			product: childProduct,
			customize: {
				items: frozenCustomize.items ?? [],
				price: frozenCustomize.price ?? null,
			},
			stripeCandidates: {
				prices: frozenChildProduct.prices,
				entitlements: frozenChildProduct.entitlements,
			},
		},
	});

	if (!entitlementPricesPlanHasWrites({ plan })) return undefined;
	return plan;
};
