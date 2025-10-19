import type { ProductV2 } from "@autumn/shared";
import { useCallback } from "react";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	useHasDetailsChanged,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { trackOnboardingProductCreation } from "@/utils/posthogTracking";
import { isPriceItem } from "@/utils/product/getItemType";
import { updateProduct } from "@/views/products/product/utils/updateProduct";
import { createProduct } from "../../utils/onboardingUtils";

export const usePlanDetailsActions = () => {
	const axiosInstance = useAxiosInstance();
	const { refetch: refetchProducts } = useProductsQuery();

	// Get product from product store (working copy)
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const hasDetailsChanged = useHasDetailsChanged();

	// Create or update product
	const handleProceed = useCallback(async (): Promise<boolean> => {
		if (!product) return false;

		// If product exists and no details changed, skip update
		if (baseProduct?.internal_id && !hasDetailsChanged) {
			return true;
		}

		let newProduct: ProductV2;

		// If baseProduct exists (update mode), update it
		if (baseProduct?.id) {
			newProduct = await updateProduct({
				axiosInstance,
				productId: baseProduct.id,
				product: product as ProductV2,
				onSuccess: async () => {},
			});
			toast.success("Product updated successfully");
		} else {
			// Create new product
			newProduct = await createProduct(product, axiosInstance);

			// Track product creation in Amplitude (only on creation, not update)
			if (newProduct) {
				const isPaid =
					newProduct.items?.some((item) => isPriceItem(item)) ?? false;
				const productType = isPaid ? "paid" : "free";

				trackOnboardingProductCreation({
					productType,
				});
			}
		}

		if (!newProduct) return false;

		// Refetch products to get latest from backend
		await refetchProducts();

		return true;
	}, [product, baseProduct, axiosInstance, refetchProducts, hasDetailsChanged]);

	return {
		handleProceed,
	};
};
