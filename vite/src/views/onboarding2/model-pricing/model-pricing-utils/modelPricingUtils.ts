import { getBackendErr, notNullish } from "@/utils/genUtils";
import { ProductV2 } from "@autumn/shared";
import { AxiosInstance } from "axios";
import { toast } from "sonner";

export const handleAutoSave = async ({
	axiosInstance,
	productId,
	product,
	refetch,
}: {
	axiosInstance: AxiosInstance;
	productId: string;
	product: ProductV2;
	refetch?: any;
}) => {
	if (!productId || !product.id) return;
	try {
		await axiosInstance.post(
			`v1/products/${productId}?upsert=true&disable_version=true`,
			{
				...product,
				group: notNullish(product.group) ? product.group : undefined,
			},
		);
		if (refetch) {
			await refetch();
		}
	} catch (error) {
		console.log(error);
		toast.error(getBackendErr(error, "Failed to auto save product"));
	}
};
