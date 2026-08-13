import {
	type FullProduct,
	isEmptyObject,
	type Product,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ProductDetailsPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { diffProductDetails } from "./diffProductDetails";
import { initProductRow } from "./initProductRow";
import { planParamsToProductRowPatch } from "./planParamsToProductRowPatch";

/**
 * Product-row facet — always returns the row stamp.
 * `previousAttributes` present only when an update changes detail columns.
 */
export const computeProductDetailsPlan = ({
	ctx,
	planParams,
	currentFullProduct,
	version,
	baseFullProduct,
}: {
	ctx: AutumnContext;
	planParams: UpdateCatalogPlanParams;
	currentFullProduct: FullProduct | null;
	version: number;
	/** Content baseline — clone source when minting (ignored when current set). */
	baseFullProduct?: FullProduct | null;
}): ProductDetailsPlan => {
	if (!currentFullProduct) {
		return {
			changed: true,
			product: initProductRow({
				ctx,
				planParams,
				version,
				...(baseFullProduct ? { base: baseFullProduct } : {}),
			}),
		};
	}

	const patch = planParamsToProductRowPatch({
		planParams,
		current: currentFullProduct,
	});
	if (isEmptyObject(patch)) {
		return { changed: false, product: currentFullProduct };
	}

	const next: Product = { ...currentFullProduct, ...patch };
	const previousAttributes = diffProductDetails({
		current: currentFullProduct,
		next,
	});
	if (isEmptyObject(previousAttributes)) {
		return { changed: false, product: currentFullProduct };
	}

	return { changed: true, product: next, previousAttributes };
};
