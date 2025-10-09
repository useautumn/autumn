import type { ProductV2 } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { type MutableRefObject, useCallback } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { updateProduct } from "@/views/products/product/utils/updateProduct";
import { createProduct } from "../../utils/onboardingUtils";

interface PlanDetailsActionsProps {
	product: ProductV2 | null;
	baseProduct: ProductV2;
	axiosInstance: AxiosInstance;
	productCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>;
	setBaseProduct: (product: ProductV2) => void;
}

export const usePlanDetailsActions = ({
	product,
	baseProduct,
	axiosInstance,
	productCreatedRef,
	setBaseProduct,
}: PlanDetailsActionsProps) => {
	const { products, refetch: refetchProducts } = useProductsQuery();

	// Create product and update base state
	const handleProceed = useCallback(async (): Promise<boolean> => {
		// Check if base product exists in products query

		let newProduct: ProductV2;
		if (products.find((p) => p.id === baseProduct.id)) {
			newProduct = await updateProduct({
				axiosInstance,
				productId: baseProduct.id,
				product: product as ProductV2,
				onSuccess: async () => {},
			});
		} else {
			newProduct = await createProduct(
				product,
				axiosInstance,
				productCreatedRef,
			);
		}

		if (!newProduct) return false;

		setBaseProduct(newProduct);
		await refetchProducts();

		return true;
	}, [
		product,
		baseProduct,
		products,
		axiosInstance,
		productCreatedRef,
		setBaseProduct,
	]);

	return {
		handleProceed,
	};
};
