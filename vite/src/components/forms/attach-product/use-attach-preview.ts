import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { ProductFormItem } from "./attach-product-form-schema";

interface CheckoutResponse {
	url?: string | null;
	customer_id: string;
	lines: Array<{
		description: string;
		amount: number;
		item?: unknown;
	}>;
	total?: number | null;
	currency?: string | null;
	has_prorations?: boolean | null;
}

interface UseAttachPreviewParams {
	customerId: string;
	products: ProductFormItem[];
	prepaidOptions: Record<string, number>;
}

export function useAttachPreview({
	customerId,
	products,
	prepaidOptions,
}: UseAttachPreviewParams) {
	const axiosInstance = useAxiosInstance();

	// Filter to only products with IDs selected
	const validProducts = products.filter((p) => p.productId);

	// Build options array for prepaid quantities
	const options = Object.entries(prepaidOptions)
		.filter(([, quantity]) => quantity > 0)
		.map(([featureId, quantity]) => ({
			feature_id: featureId,
			quantity: quantity,
		}));

	return useQuery({
		queryKey: [
			"attach-checkout",
			customerId,
			validProducts.map((p) => ({ id: p.productId, qty: p.quantity })),
			options,
		],
		queryFn: async () => {
			if (validProducts.length === 0) {
				return null;
			}

			const response = await axiosInstance.post<CheckoutResponse>(
				"/v1/checkout",
				{
					customer_id: customerId,
					products: validProducts.map((p) => ({
						product_id: p.productId,
						quantity: p.quantity,
					})),
					options: options.length > 0 ? options : undefined,
				},
			);

			return response.data;
		},
		enabled: !!customerId && validProducts.length > 0,
		staleTime: 0, // Always fetch fresh pricing
	});
}
