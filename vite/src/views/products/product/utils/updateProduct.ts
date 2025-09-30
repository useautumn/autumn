import {
	type FrontendProductItem,
	type ProductV2,
	UpdateProductSchema,
} from "@autumn/shared";
import type { AxiosError, AxiosInstance } from "axios";
import { toast } from "sonner";
import type { ZodError } from "zod";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";
import { validateItemsBeforeSave } from "../../plan/utils/validateItemsBeforeSave";

export const updateProduct = async ({
	axiosInstance,
	product,
	onSuccess,
}: {
	axiosInstance: AxiosInstance;
	product: ProductV2;
	onSuccess: () => Promise<void>;
}) => {
	const validated = validateItemsBeforeSave(
		product.items as FrontendProductItem[],
	);

	if (!validated) {
		return false;
	}
	try {
		const updateData = {
			...UpdateProductSchema.parse(product),
			items: product.items,
			free_trial: product.free_trial,
		};

		await ProductService.updateProduct(axiosInstance, product.id, updateData);

		toast.success("Product updated successfully");

		await onSuccess();
		return true;
	} catch (error) {
		console.error(error);
		toast.error(
			getBackendErr(error as AxiosError | ZodError, "Failed to update product"),
		);
		return false;
	}
};
