import type {
	CatalogPlanVersioningStrategy,
	FullProduct,
	Product,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	computeEntitlementPricesPlan,
	type EntitlementPricesPlan,
	type EntitlementPricesPlanMode,
	entitlementPricesPlanHasWrites,
} from "@/internal/products/actions/computeEntitlementPricesPlan";

/**
 * Catalog facet: planParams.price/items → EntitlementPricesPlan.
 * Thin adapter over the shared products planner.
 */
export const computeCatalogEntitlementPricesPlan = ({
	ctx,
	product,
	baseFullProduct,
	planParams,
	versioning,
	protectReferencedRows,
}: {
	ctx: AutumnContext;
	product: Product;
	baseFullProduct: FullProduct | null;
	planParams: UpdateCatalogPlanParams;
	versioning: CatalogPlanVersioningStrategy;
	protectReferencedRows: boolean;
}): EntitlementPricesPlan | undefined => {
	const currentRows = baseFullProduct
		? {
				prices: baseFullProduct.prices,
				entitlements: baseFullProduct.entitlements,
			}
		: undefined;

	const mode: EntitlementPricesPlanMode =
		versioning === "new_version"
			? { type: "version" }
			: { type: "update", protectReferencedRows };

	const hasCustomize =
		planParams.price !== undefined || planParams.items !== undefined;

	// Version mint always runs so omitted items/price expand from base.
	if (!hasCustomize && mode.type !== "version") {
		return undefined;
	}

	const plan = computeEntitlementPricesPlan({
		ctx,
		params: {
			mode,
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
