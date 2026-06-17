import type { FrontendProduct, ProductV2 } from "@autumn/shared";
import {
	productsAreSame,
	productV2ToFrontendProduct,
	sortPlanItems,
} from "@autumn/shared";
import { useEffect, useRef } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { normalizeResetInterval } from "@/utils/product/productItemUtils";
import { useProductStore } from "./useProductStore";

/**
 * Syncs product store with backend data (single product query)
 */
export const useProductSync = ({
	product,
}: {
	product: ProductV2 | undefined;
}) => {
	const setBaseProduct = useProductStore((s) => s.setBaseProduct);
	const setProduct = useProductStore((s) => s.setProduct);
	const currentProduct = useProductStore((s) => s.product);
	const { features = [] } = useFeaturesQuery();
	const hasInitialized = useRef(false);
	const lastProductRef = useRef<ProductV2 | null>(null);

	useEffect(() => {
		if (!product) return;

		// Check if this is a new product (ID changed) or if product data changed
		const isNewProduct = lastProductRef.current?.id !== product.id;
		const isVersionChanged =
			lastProductRef.current?.version !== product.version;
		const isProductUpdated = lastProductRef.current !== product;

		if (isNewProduct || isProductUpdated) {
			lastProductRef.current = product;

			const converted = productV2ToFrontendProduct({ product });
			const frontendProduct: FrontendProduct = {
				...converted,
				items: sortPlanItems({ items: converted.items }).map(
					normalizeResetInterval,
				),
			};

			// "Clean" = working copy has no unsaved edits vs the base it was synced
			// from. Captured before setBaseProduct overwrites it below.
			const baseBeforeSync = useProductStore.getState().baseProduct;
			const editorIsClean =
				!!baseBeforeSync &&
				productsAreSame({
					newProductV2: currentProduct,
					curProductV2: baseBeforeSync,
					features,
				}).same;

			// Always update baseProduct to reflect backend state
			setBaseProduct(frontendProduct);

			// Reset the working copy on initial load, when switching products, on a
			// version change, or whenever the editor is clean — the last case keeps
			// the working copy in lockstep after an in-place save (same version),
			// without clobbering genuine unsaved edits.
			if (
				!hasInitialized.current ||
				isNewProduct ||
				isVersionChanged ||
				editorIsClean
			) {
				// Preserve frontend-only fields during creation flow, so Free vs Variable shows correctly
				const shouldPreserveFrontendFields =
					!currentProduct?.internal_id &&
					product.items.length === 0 &&
					currentProduct?.basePriceType === "usage";

				const mergedProduct: FrontendProduct = shouldPreserveFrontendFields
					? {
							...frontendProduct,
							basePriceType:
								currentProduct?.basePriceType ?? frontendProduct.basePriceType,
							planType: currentProduct?.planType ?? frontendProduct.planType,
						}
					: frontendProduct;

				setProduct(mergedProduct);
				hasInitialized.current = true;
			}
		}
	}, [product, setBaseProduct, setProduct, currentProduct, features]);
};
