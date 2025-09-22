import type { ProductItem, ProductV2 } from "@autumn/shared";
import { useEffect, useRef, useState } from "react";
import { sortProductItems } from "@/utils/productUtils";

export const useProductData = ({
	originalProduct,
}: {
	originalProduct: ProductV2 | null;
}) => {
	const initialProductRef = useRef<ProductV2 | null>(null);
	const [hasChanges, setHasChanges] = useState(false);
	const [product, setProduct] = useState<ProductV2 | null>(null);
	const [entityFeatureIds, setEntityFeatureIds] = useState<string[]>([]);

	useEffect(() => {
		const initEntityFeatureIds = (product: ProductV2 | null) => {
			if (!product) return [];
			return Array.from(
				new Set(
					product.items
						.filter((item: ProductItem) => item.entity_feature_id != null)
						.map((item: ProductItem) => item.entity_feature_id as string),
				),
			);
		};

		if (originalProduct) {
			const sortedProduct = {
				...originalProduct,
				items: sortProductItems(originalProduct.items),
			};

			initialProductRef.current = structuredClone(sortedProduct);
			setEntityFeatureIds(initEntityFeatureIds(sortedProduct));
			setProduct(sortedProduct);
		}
	}, [originalProduct]);

	useEffect(() => {
		if (!product) return;

		const sortedProduct = {
			...product,
			items: sortProductItems(product.items),
		};

		if (JSON.stringify(product.items) !== JSON.stringify(sortedProduct.items)) {
			setProduct(sortedProduct);
		}

		const originalProduct = initialProductRef.current;

		if (!originalProduct || !sortedProduct) {
			setHasChanges(false);
			return;
		}

		const {
			is_default: _is_default,
			is_add_on: _is_add_on,
			...rest
		} = sortedProduct;

		const {
			is_default: _originalIsDefault,
			is_add_on: _originalIsAddOn,
			...originalRest
		} = originalProduct;

		const hasChanged = JSON.stringify(rest) !== JSON.stringify(originalRest);

		setHasChanges(hasChanged);
	}, [product]);

	const isNewProduct =
		initialProductRef.current?.items?.length === 0 &&
		!initialProductRef.current?.free_trial;

	const actionState = {
		disabled: !hasChanges,
		buttonText: isNewProduct ? "Create Product" : "Update Product",
		tooltipText: !hasChanges
			? isNewProduct
				? "Add entitlements and prices to create a new product"
				: `Make a change to the entitlements or prices to update ${product?.name}`
			: isNewProduct
				? `Create a new product: ${product?.name} `
				: `Save changes to product: ${product?.name}`,
	};

	return {
		product,
		setProduct,
		hasChanges,
		entityFeatureIds,
		setEntityFeatureIds,
		actionState,
		isNewProduct,
	};
};
