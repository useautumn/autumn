import type { StripeProductSearchResponse } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useStripeProductsSearchQuery = ({
	search,
	enabled = true,
}: {
	search?: string;
	enabled?: boolean;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const normalizedSearch = search?.trim() || undefined;

	const { data, isLoading, isFetching, isPlaceholderData, error } =
		useQuery<StripeProductSearchResponse>({
			queryKey: buildKey(["stripe-products-search", normalizedSearch ?? ""]),
			enabled,
			queryFn: async () => {
				const { data } = await axiosInstance.get<StripeProductSearchResponse>(
					"/v1/organization/stripe/products/search",
					{
						params: {
							search: normalizedSearch,
							limit: 10,
						},
					},
				);
				return data;
			},
			placeholderData: keepPreviousData,
		});

	return {
		stripeProducts: data?.stripe_products ?? [],
		stripeConnected: data?.stripe_connected ?? false,
		isLoading,
		isFetching,
		isPlaceholderData,
		error,
	};
};
