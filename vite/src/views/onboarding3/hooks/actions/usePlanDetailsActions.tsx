import type { ProductV2 } from "@autumn/shared";
import { useCallback } from "react";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { updateProduct } from "@/views/products/product/utils/updateProduct";
import { createProduct } from "../../utils/onboardingUtils";

export const usePlanDetailsActions = () => {
	const axiosInstance = useAxiosInstance();
	const { refetch: refetchProducts } = useProductsQuery();

	// Get product from product store (working copy)
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);

	// Create or update product
	const handleProceed = useCallback(async (): Promise<boolean> => {
		if (!product) return false;

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
		}

		if (!newProduct) return false;

		// Refetch products - useOnboardingProductSync will handle syncing product/baseProduct
		await refetchProducts();

		return true;
	}, [product, baseProduct, axiosInstance, refetchProducts]);

	return {
		handleProceed,
	};
};
