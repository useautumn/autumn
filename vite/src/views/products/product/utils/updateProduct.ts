import {
	type FrontendProductItem,
	type UpdateProductV2Params,
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
	product: UpdateProductV2Params;
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
		if (error instanceof Error && "issues" in error) {
			// It's a ZodError
			console.error(
				"Zod validation failed:",
				JSON.stringify((error as ZodError).issues, null, 2),
			);
		}
		console.error("Failed to update product", error);
		toast.error(
			getBackendErr(error as AxiosError | ZodError, "Failed to update product"),
		);
		return false;
	}
};
