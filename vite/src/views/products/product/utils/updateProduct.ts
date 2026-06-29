import {
	type FrontendProductItem,
	sortPlanItems,
	type UpdateProductV2Params,
	UpdateProductV2ParamsSchema,
} from "@autumn/shared";
import type { AxiosError, AxiosInstance } from "axios";
import { toast } from "sonner";
import type { ZodError } from "zod";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";
import { validateItemsBeforeSave } from "../../plan/utils/validateItemsBeforeSave";

type EditableProductUpdate = UpdateProductV2Params & {
	base_id?: string | null;
};

export const updateProduct = async ({
	axiosInstance,
	productId,
	product,
	onSuccess,
	version,
}: {
	axiosInstance: AxiosInstance;
	productId: string;
	product: EditableProductUpdate;
	onSuccess: () => Promise<void>;
	version?: number;
}) => {
	const validated = validateItemsBeforeSave(
		product.items as FrontendProductItem[],
	);

	if (!validated) {
		return false;
	}

	try {
		const sortedItems = sortPlanItems({ items: product.items });
		const { base_id, ...productUpdates } = product;
		const updateData = UpdateProductV2ParamsSchema.parse({
			...productUpdates,
			...(base_id !== undefined ? { base_plan_id: base_id } : {}),
			items: sortedItems,
			free_trial: product.free_trial,
		});

		const options = version ? { version } : undefined;

		const updatedProduct = await ProductService.updateProduct(
			axiosInstance,
			productId,
			updateData,
			options,
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
