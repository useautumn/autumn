import type { ProductItem, ProductV2 } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges, useProductStore } from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getAttachBody } from "@/views/customers/customer/product/components/attachProductUtils";
import { useAttachProductFormContext } from "./attach-product-form-context";

export interface CheckoutResponse {
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

export type AttachPreviewData = CheckoutResponse;

export function useAttachPreview() {
	const form = useAttachProductFormContext();
	const axiosInstance = useAxiosInstance();
	const { products } = useProductsQuery();
	const isCustom = useHasChanges();
	const { product: customProduct } = useProductStore();

	const { customerId, productId, prepaidOptions } = useStore(
		form.store,
		(state) => state.values,
	);

	const product =
		isCustom && customProduct
			? customProduct
			: products.find((p) => p.id === productId);

	const options = (Object.entries(prepaidOptions) as [string, number][])
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
