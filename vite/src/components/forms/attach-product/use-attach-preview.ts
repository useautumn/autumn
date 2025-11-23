import type { ProductItem, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAttachProductStore } from "@/hooks/stores/useAttachProductStore";
import { useHasChanges, useProductStore } from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getAttachBody } from "@/views/customers/customer/product/components/attachProductUtils";

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
	product?: ProductV2 & {
		items: ProductItem[];
	};
	current_product?: ProductV2 & {
		items: ProductItem[];
	};
	options?: unknown[];
}

export function useAttachPreview() {
	const axiosInstance = useAxiosInstance();
	const { products } = useProductsQuery();
	const isCustom = useHasChanges();
	const { product: customProduct } = useProductStore();

	// Get form values from store
	const customerId = useAttachProductStore((s) => s.customerId);
	const productId = useAttachProductStore((s) => s.productId);
	const prepaidOptions = useAttachProductStore((s) => s.prepaidOptions);

	// Use custom product from store if there are changes, otherwise fetch from products list
	const product =
		isCustom && customProduct
			? customProduct
			: products.find((p) => p.id === productId);

	// console.log("product", product);

	const options = Object.entries(prepaidOptions)
		.filter(([, quantity]) => quantity > 0)
		.map(([featureId, quantity]) => ({
			feature_id: featureId,
			quantity: quantity,
		}));

	const attachBody =
		product && customerId
			? getAttachBody({
					customerId: customerId,
					product,
					optionsInput: options,
					isCustom,
				})
			: null;

	return useQuery({
		queryKey: [
			"attach-checkout",
			customerId,
			product?.items,
			options,
			isCustom,
		],
		queryFn: async () => {
			if (!productId || !attachBody || !customerId) {
				return null;
			}

			const response = await axiosInstance.post<CheckoutResponse>(
				"/v1/checkout",
				attachBody,
			);

			return response.data;
		},
		enabled: !!customerId && !!productId && !!product,
		staleTime: 0, // Always fetch fresh pricing
	});
}
