import type { ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/**
 * Fetch the (possibly historical) product versions that own the given price IDs.
 * Used by the reward update sheet to resolve price IDs whose owning product
 * version isn't in the latest-versions list, without paying for all_versions=true.
 */
export const useProductsByPriceIdsQuery = (priceIds: string[]) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const sortedIds = [...priceIds].sort();
	const queryKey = buildKey(["products", "by-price-ids", sortedIds.join(",")]);

	const { data, isLoading, error, refetch } = useQuery<{
		products: ProductV2[];
	}>({
		queryKey,
		enabled: sortedIds.length > 0,
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				"/products/products/by-price-ids",
				{
					params: { ids: sortedIds.join(",") },
				},
			);
			return data;
		},
	});

	return {
		products: data?.products ?? [],
		isLoading,
		error,
		refetch,
	};
};
