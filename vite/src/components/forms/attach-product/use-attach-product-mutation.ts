import { UsageModel } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface AttachProductParams {
	products: Array<{ productId: string }>;
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

	return useMutation({
		mutationFn: async (params: AttachProductParams) => {
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

			const attachPromises = params.products.map(async (item) => {
				const attachBody = {
					customer_id: customerId,
					product_id: item.productId,
					options: prepaidOptions.length > 0 ? prepaidOptions : undefined,
					invoice: params.useInvoice,
					enable_product_immediately: params.useInvoice
						? params.enableProductImmediately
						: undefined,
					finalize_invoice: params.useInvoice ? false : undefined,
					success_url: window.location.href,
				};

				return await CusService.attach(axiosInstance, attachBody);
			});

			return await Promise.all(attachPromises);
		},
		onSuccess: (results) => {
			toast.success(`Successfully attached ${results.length} product(s)`);

			// Invalidate customer queries to refresh data
			queryClient.invalidateQueries({ queryKey: ["customer", customerId] });

			onSuccess?.();
		},
		onError: (error) => {
			toast.error("Failed to attach products");
			console.error(error);
		},
	});
}
