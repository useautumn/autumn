import type {
	EntitlementWithFeature,
	Price,
	Product,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	computeEntitlementPricesPlan,
	type EntitlementPricesPlan,
	entitlementPricesPlanHasWrites,
} from "@/internal/products/actions/computeEntitlementPricesPlan";

/**
 * Catalog facet: planParams.price/items → EntitlementPricesPlan.
 * Thin adapter over the shared products planner.
 */
export const computeCatalogEntitlementPricesPlan = ({
	ctx,
	product,
	currentRows,
	planParams,
	protectReferencedRows,
}: {
	ctx: AutumnContext;
	product: Product;
	currentRows?: {
		prices: Price[];
		entitlements: EntitlementWithFeature[];
	};
	planParams: UpdateCatalogPlanParams;
	protectReferencedRows: boolean;
}): EntitlementPricesPlan | undefined => {
	if (planParams.price === undefined && planParams.items === undefined) {
		return undefined;
	}

	const plan = computeEntitlementPricesPlan({
		ctx,
		params: {
			mode: { type: "update", protectReferencedRows },
			product,
			customize: {
				...(planParams.price !== undefined ? { price: planParams.price } : {}),
				...(planParams.items !== undefined ? { items: planParams.items } : {}),
			},
			currentRows,
		},
	});

	if (!entitlementPricesPlanHasWrites({ plan })) return undefined;
	return plan;
};
