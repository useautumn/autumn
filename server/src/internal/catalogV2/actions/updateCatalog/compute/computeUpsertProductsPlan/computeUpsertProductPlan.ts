import type { ProductKey, UpdateCatalogPlanParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { assembleNextFullProduct } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/assembleNextFullProduct";
import { computeCatalogEntitlementPricesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeCatalogEntitlementPricesPlan/computeCatalogEntitlementPricesPlan";
import { computeProductDetailsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/computeProductDetailsPlan";
import { resolveUpsertOp } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/resolveUpsertOp";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	UpsertProductPlan,
	UpsertProductSource,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

/** One productKey + planParams → UpsertProductPlan against productStatesContext. */
export const computeUpsertProductPlan = ({
	ctx,
	productKey,
	planParams,
	source,
	productStatesContext,
}: {
	ctx: AutumnContext;
	productKey: ProductKey;
	planParams: UpdateCatalogPlanParams;
	source: UpsertProductSource;
	productStatesContext: ProductStatesContext;
}): UpsertProductPlan => {
	const { currentFullProduct, customerUsage } = productKeyToState({
		productKey,
		productStatesContext,
	});

	const details = computeProductDetailsPlan({
		ctx,
		planParams,
		currentFullProduct,
		version: productKey.version,
	});

	const detailsChanged =
		!currentFullProduct || details.previousAttributes !== undefined;

	const entitlementPricesPlan = computeCatalogEntitlementPricesPlan({
		ctx,
		product: details.product,
		currentRows: currentFullProduct
			? {
					prices: currentFullProduct.prices,
					entitlements: currentFullProduct.entitlements,
				}
			: undefined,
		planParams,
		protectReferencedRows: customerUsage.hasAnyCustomerProducts,
	});

	const nextFullProduct = assembleNextFullProduct({
		product: details.product,
		entitlementPricesPlan,
		features: ctx.features,
		currentFullProduct,
	});

	const op = resolveUpsertOp({
		currentFullProduct,
		detailsChanged,
		entitlementPricesPlan,
	});

	return {
		row: {
			planId: productKey.planId,
			version: productKey.version,
			op,
			source,
			currentFullProduct,
			nextFullProduct,
		},
		...(detailsChanged ? { details } : {}),
		...(entitlementPricesPlan ? { entitlementPricesPlan } : {}),
		state: {
			hasCustomers: customerUsage.hasVersionableCustomerProducts,
		},
	};
};
