import type {
	CatalogStripeProduct,
	StripeProductResolveResponse,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useStripeProductsResolveQuery = ({
	stripeProductIds,
	enabled = true,
}: {
	stripeProductIds: string[];
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const sortedIds = useMemo(
		() => Array.from(new Set(stripeProductIds.filter(Boolean))).sort(),
		[stripeProductIds],
	);

	const { data, isLoading, isFetching, error } =
		useQuery<StripeProductResolveResponse>({
			queryKey: buildKey(["stripe-products-resolve", sortedIds.join(",")]),
			enabled: enabled && sortedIds.length > 0,
			queryFn: async () => {
				const { data } = await axiosInstance.post<StripeProductResolveResponse>(
					"/v1/organization/stripe/products/resolve",
					{ stripe_product_ids: sortedIds },
				);
				return data;
			},
		});

	const stripeProductsById = useMemo(() => {
		const map = new Map<string, CatalogStripeProduct>();
		for (const product of data?.stripe_products ?? []) {
			map.set(product.id, product);
		}
		return map;
	}, [data]);

	return {
		stripeProductsById,
		stripeProducts: data?.stripe_products ?? [],
		isLoading: sortedIds.length > 0 && isLoading,
		isResolving: sortedIds.length > 0 && (isLoading || isFetching),
		error,
	};
};
