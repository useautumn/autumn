import { type ProductV2, UpdateProductSchema } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { toast } from "sonner";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";

export const updateProduct = async ({
	axiosInstance,
	product,
	onSuccess,
	// mutate,
	// mutateCount,
}: {
	axiosInstance: AxiosInstance;
	product: ProductV2;
	onSuccess: () => Promise<void>;
	// mutate: () => void;
	// mutateCount: () => void;
}) => {
	try {
		await ProductService.updateProduct(axiosInstance, product.id, {
			...UpdateProductSchema.parse(product),
			items: product.items,
			free_trial: product.free_trial,
		});

		toast.success("Product updated successfully");

		await onSuccess();
		return true;
	} catch (error) {
		console.error(error);
		toast.error(getBackendErr(error, "Failed to update product"));
		return false;
	}
};
