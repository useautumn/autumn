import {
	type FullProduct,
	type ProductKey,
	productToProductKey,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { assembleNextFullProduct } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/assembleNextFullProduct";
import { computeCatalogEntitlementPricesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeCatalogEntitlementPricesPlan/computeCatalogEntitlementPricesPlan";
import { computeFreeTrialPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeFreeTrialPlan/computeFreeTrialPlan";
import { computeProductDetailsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/computeProductDetailsPlan";
import { resolveUpsertOp } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/resolveUpsertOp";
import { resolveUpsertVersioning } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/resolveUpsertVersioning";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	UpsertProductPlan,
	UpsertProductSource,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

const latestFullProductForPlan = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): FullProduct | null =>
	productStatesContext.versionsByPlanId[planId]?.[0] ?? null;

const planHasVersionableCustomers = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): boolean =>
	(productStatesContext.versionsByPlanId[planId] ?? []).some(
		(product) =>
			productKeyToState({
				productKey: productToProductKey({ product }),
				productStatesContext,
			}).customerUsage.hasVersionableCustomerProducts,
	);

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
	const versioning = resolveUpsertVersioning({ planParams, source });
	const { currentFullProduct, customerUsage } = productKeyToState({
		productKey,
		productStatesContext,
	});

	// Content baseline: row at this version, or latest when minting a new version.
	const baseFullProduct =
		currentFullProduct ??
		(versioning === "new_version"
			? latestFullProductForPlan({
					planId: productKey.planId,
					productStatesContext,
				})
			: null);

	const details = computeProductDetailsPlan({
		ctx,
		planParams,
		currentFullProduct,
		version: productKey.version,
		baseFullProduct,
	});

	const freeTrialPlan = computeFreeTrialPlan({
		freeTrialParams: planParams.free_trial,
		currentFreeTrial: baseFullProduct?.free_trial ?? null,
		internalProductId: details.product.internal_id,
		mode:
			versioning === "new_version" ? { type: "version" } : { type: "update" },
	});

	const entitlementPricesPlan = computeCatalogEntitlementPricesPlan({
		ctx,
		product: details.product,
		baseFullProduct,
		planParams,
		versioning,
		protectReferencedRows: customerUsage.hasVersionableRowRefs,
	});

	const nextFullProduct = assembleNextFullProduct({
		product: details.product,
		entitlementPricesPlan,
		freeTrial: freeTrialPlan.projected,
		features: ctx.features,
		currentFullProduct: baseFullProduct,
	});

	const op = resolveUpsertOp({
		currentFullProduct,
		detailsChanged: details.changed,
		entitlementPricesPlan,
		freeTrialChanged: freeTrialPlan.changed,
	});

	return {
		row: {
			planId: productKey.planId,
			version: productKey.version,
			op,
			source,
			versioning,
			currentFullProduct,
			// Mint-only clone source for preview; null on in-place writes.
			baseFullProduct:
				versioning === "new_version" ? baseFullProduct : null,
			nextFullProduct,
		},
		...(details.changed ? { details } : {}),
		...(entitlementPricesPlan ? { entitlementPricesPlan } : {}),
		...(freeTrialPlan.changed ? { freeTrialPlan } : {}),
		state: {
			hasCustomers:
				versioning === "new_version"
					? planHasVersionableCustomers({
							planId: productKey.planId,
							productStatesContext,
						})
					: customerUsage.hasVersionableCustomerProducts,
		},
	};
};
