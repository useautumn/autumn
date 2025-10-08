import type { ProductV2 } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { type MutableRefObject, useCallback } from "react";
import { createProduct } from "../../utils/onboardingUtils";

interface PlanDetailsActionsProps {
	product: ProductV2 | null;
	axiosInstance: AxiosInstance;
	productCreatedRef: MutableRefObject<{
		created: boolean;
		latestId: string | null;
	}>;
	setBaseProduct: (product: ProductV2) => void;
	setIsLoading: (loading: boolean) => void;
}

export const usePlanDetailsActions = ({
	product,
	axiosInstance,
	productCreatedRef,
	setBaseProduct,
	setIsLoading,
}: PlanDetailsActionsProps) => {
	// Create product and update base state
	const handleProceed = useCallback(async (): Promise<boolean> => {
		const createdProduct = await createProduct(
			product,
			axiosInstance,
			productCreatedRef,
		);

		if (!createdProduct) return false;

		setBaseProduct(createdProduct);
		return true;
	}, [product, axiosInstance, productCreatedRef, setBaseProduct]);

	return {
		handleProceed,
	};
};
