import {
	type FullProduct,
	isEligibleDefaultProduct,
	isEmptyObject,
	type Product,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ProductDetailsPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { isExistingRowPromote } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/isExistingRowPromote";
import { applyPlanProcessorsToProduct } from "./applyPlanProcessorsToProduct";
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
	baseInternalProductId,
	baseProcessor,
	currentActive,
	latestExistingVersion,
	fullState = false,
}: {
	ctx: AutumnContext;
	planParams: UpdateCatalogPlanParams;
	currentFullProduct: FullProduct | null;
	version: number;
	/** Content baseline — clone source when minting (ignored when current set). */
	baseFullProduct?: FullProduct | null;
	/** Variant pointer. Compute-owned — not a request field. */
	baseInternalProductId?: string | null;
	/** Variant create: share the base's Stripe Product. */
	baseProcessor?: Product["processor"];
	/** Pre-fold pointer — default follows only when this row is eligible. */
	currentActive?: FullProduct | null;
	latestExistingVersion?: number;
	/** The payload is the whole desired catalog, so presence carries meaning. */
	fullState?: boolean;
}): ProductDetailsPlan => {
	if (!currentFullProduct) {
		return {
			changed: true,
			product: initProductRow({
				ctx,
				planParams,
				version,
				...(baseFullProduct ? { base: baseFullProduct } : {}),
				...(baseInternalProductId !== undefined
					? { baseInternalProductId }
					: {}),
				...(baseProcessor !== undefined ? { baseProcessor } : {}),
			}),
		};
	}

	const patch = planParamsToProductRowPatch({
		planParams,
		current: currentFullProduct,
	});
	if (
		isExistingRowPromote({
			current: currentFullProduct,
			next: { ...currentFullProduct, ...patch },
		}) &&
		planParams.is_default === undefined &&
		currentActive?.is_default &&
		isEligibleDefaultProduct({
			product: currentFullProduct,
			latestExistingVersion,
		})
	) {
		patch.is_default = true;
	}
	// Archived rows never live in a config, so stating one is how you ask for
	// it back — presence is the signal, and `archived: false` is never needed.
	if (
		fullState &&
		currentFullProduct.archived &&
		patch.archived === undefined
	) {
		patch.archived = false;
	}

	const patched: Product = {
		...currentFullProduct,
		...patch,
		...(baseInternalProductId !== undefined
			? {
					base_internal_product_id: baseInternalProductId,
					...(baseInternalProductId ? { is_default: false } : {}),
				}
			: {}),
	};
	const { product: next, changed: processorChanged } =
		applyPlanProcessorsToProduct({
			product: patched,
			processors: planParams.processors,
		});
	const previousAttributes = diffProductDetails({
		current: currentFullProduct,
		next,
	});
	if (isEmptyObject(previousAttributes) && !processorChanged) {
		return { changed: false, product: currentFullProduct };
	}

	return {
		changed: true,
		product: next,
		...(isEmptyObject(previousAttributes) ? {} : { previousAttributes }),
	};
};
