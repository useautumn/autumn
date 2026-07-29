import {
	type FrontendProductItem,
	type ProductItem,
	sortPlanItems,
	type UpdateProductV2Params,
	UpdateProductV2ParamsSchema,
} from "@autumn/shared";
import type { AxiosError, AxiosInstance } from "axios";
import { toast } from "sonner";
import type { ZodError } from "zod";
import { ProductService } from "@/services/products/ProductService";
import { getBackendErr } from "@/utils/genUtils";
import { normalizeItemCurrencies } from "../../plan/utils/currencyUtils";
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
	disableVersion,
	orgCurrency,
}: {
	axiosInstance: AxiosInstance;
	productId: string;
	product: EditableProductUpdate;
	onSuccess: () => Promise<void>;
	version?: number;
	disableVersion?: boolean;
	orgCurrency?: string;
}) => {
	const validated = validateItemsBeforeSave(
		product.items as FrontendProductItem[],
	);

	if (!validated) {
		return false;
	}

	try {
		const items = orgCurrency
			? (product.items as ProductItem[]).map((item) =>
					normalizeItemCurrencies({ item, orgCurrency }),
				)
			: product.items;
		const sortedItems = sortPlanItems({ items });
		const { base_id, ...productUpdates } = product;
		const updateData = UpdateProductV2ParamsSchema.parse({
			...productUpdates,
			...(base_id !== undefined ? { base_plan_id: base_id } : {}),
			items: sortedItems,
			free_trial: product.free_trial,
		});

		const options =
			version || disableVersion ? { version, disableVersion } : undefined;

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
