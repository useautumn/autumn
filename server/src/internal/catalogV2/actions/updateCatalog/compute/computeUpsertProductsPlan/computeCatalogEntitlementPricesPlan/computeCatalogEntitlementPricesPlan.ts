import type {
	CatalogPlanVersioningStrategy,
	FullProduct,
	Product,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	type ComputeEntitlementPricesPlanParams,
	computeEntitlementPricesPlan,
	type EntitlementPricesPlan,
	type EntitlementPricesPlanMode,
	entitlementPricesPlanHasWrites,
} from "@/internal/products/actions/computeEntitlementPricesPlan";

export const computeCatalogEntitlementPricesPlan = ({
	ctx,
	product,
	baseFullProduct,
	planParams,
	versioning,
	protectReferencedRows,
	stripeCandidates,
}: {
	ctx: AutumnContext;
	product: Product;
	baseFullProduct: FullProduct | null;
	planParams: UpdateCatalogPlanParams;
	versioning: CatalogPlanVersioningStrategy;
	protectReferencedRows: boolean;
	stripeCandidates?: ComputeEntitlementPricesPlanParams["stripeCandidates"];
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
			...(stripeCandidates !== undefined ? { stripeCandidates } : {}),
		},
	});

	if (!entitlementPricesPlanHasWrites({ plan })) return undefined;
	return plan;
};
