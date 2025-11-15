import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface AttachProductParams {
	products: Array<{ productId: string }>;
	prepaidOptions: Array<{
		feature_id: string;
		quantity: number;
		billing_units: number;
	}>;
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

	return useMutation({
		mutationFn: async (params: AttachProductParams) => {
			const attachPromises = params.products.map(async (item) => {
				const attachBody = {
					customer_id: customerId,
					product_id: item.productId,
					options:
						params.prepaidOptions.length > 0
							? params.prepaidOptions
									.filter((opt) => opt.quantity > 0)
									.map((opt) => ({
										feature_id: opt.feature_id,
										quantity: opt.quantity * opt.billing_units,
									}))
							: undefined,
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
