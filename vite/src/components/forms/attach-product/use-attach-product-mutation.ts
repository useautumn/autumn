import { type ProductV2, UsageModel } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges, useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getAttachBody } from "@/views/customers/customer/product/components/attachProductUtils";

interface AttachProductParams {
	productId: string;
	prepaidOptions: Record<string, number>;
	useInvoice: boolean;
	enableProductImmediately?: boolean;
}

export function useAttachProductMutation({
	customerId,
	onSuccess,
}: {
	customerId: string;
	onSuccess?: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const { products: allProducts } = useProductsQuery();
	const { closeSheet } = useSheetStore();
	const isCustom = useHasChanges();
	const { product: customProduct } = useProductStore();

	return useMutation({
		mutationFn: async (params: AttachProductParams) => {
			// Use custom product from store if there are changes, otherwise fetch from products list
			const product =
				isCustom && customProduct
					? customProduct
					: allProducts.find((p) => p.id === params.productId);

			// Build prepaid options by joining quantities with product data to get billing_units
			const prepaidOptions = Object.entries(params.prepaidOptions)
				.filter(([, quantity]) => quantity > 0)
				.map(([featureId, quantity]) => {
					// Find the product that contains this feature
					for (const product of allProducts) {
						const productItem = product.items?.find(
							(item) =>
								item.feature_id === featureId &&
								item.usage_model === UsageModel.Prepaid,
						);
						if (productItem) {
							return {
								feature_id: featureId,
								quantity: quantity * (productItem.billing_units || 1),
							};
						}
					}
					return null;
				})
				.filter(Boolean) as Array<{ feature_id: string; quantity: number }>;

			const attachBody = getAttachBody({
				customerId: customerId,
				product: product as ProductV2,
				optionsInput: prepaidOptions,
				isCustom,
			});

			return await CusService.attach(axiosInstance, attachBody);
		},
		onSuccess: () => {
			toast.success("Successfully attached product");
			//close sheet
			closeSheet();

			// Invalidate customer queries to refresh data
			queryClient.invalidateQueries({ queryKey: ["customer", customerId] });

			onSuccess?.();
		},
		onError: (error) => {
			toast.error("Failed to attach product");
			console.error(error);
		},
	});
}
