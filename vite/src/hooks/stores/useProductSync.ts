import type { FrontendProduct, ProductV2 } from "@autumn/shared";
import {
	productsAreSame,
	productV2ToFrontendProduct,
	sortPlanItems,
} from "@autumn/shared";
import { useEffect, useRef } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductStore } from "./useProductStore";

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

		const isNewProduct = lastProductRef.current?.id !== product.id;
		const isVersionChanged =
			lastProductRef.current?.version !== product.version;
		const isProductUpdated = lastProductRef.current !== product;

		if (isNewProduct || isProductUpdated) {
			lastProductRef.current = product;

			const converted = productV2ToFrontendProduct({ product });
			const frontendProduct: FrontendProduct = {
				...converted,
				items: sortPlanItems({ items: converted.items }),
			};

			const baseBeforeSync = useProductStore.getState().baseProduct;
			const editorIsClean =
				!!baseBeforeSync &&
				productsAreSame({
					newProductV2: currentProduct,
					curProductV2: baseBeforeSync,
					features,
				}).same;

			setBaseProduct(frontendProduct);

			if (
				!hasInitialized.current ||
				isNewProduct ||
				isVersionChanged ||
				editorIsClean
			) {
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
