import {
	type FrontendProductItem,
	type ProductV2,
	UpdateProductV2ParamsSchema,
} from "@autumn/shared";
import type { AxiosError, AxiosInstance } from "axios";
import { toast } from "sonner";
import type { ZodError } from "zod";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";
import { validateItemsBeforeSave } from "../../plan/utils/validateItemsBeforeSave";

export const updateProduct = async ({
	axiosInstance,
	productId,
	product,
	onSuccess,
}: {
	axiosInstance: AxiosInstance;
	productId: string;
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
		const updateData = UpdateProductV2ParamsSchema.parse({
			...product,
			items: product.items,
			free_trial: product.free_trial,
		});

		const updatedProduct = await ProductService.updateProduct(
			axiosInstance,
			productId,
			updateData,
		);

		await onSuccess();
		return updatedProduct;
	} catch (error) {
		toast.error(
			getBackendErr(error as AxiosError | ZodError, "Failed to update product"),
		);
		return false;
	}
};
