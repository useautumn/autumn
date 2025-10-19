import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useMemo } from "react";
import { useParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { throwBackendError } from "@/utils/genUtils";
import { useCachedProduct } from "./getCachedProduct";
import { useMigrationsQuery } from "./queries/useMigrationsQuery.tsx";
import { useProductCountsQuery } from "./queries/useProductCountsQuery";

// Product query state...
export const useProductQueryState = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			version: parseAsInteger,
			productId: parseAsString,
		},
		{
			history: "push",
		},
	);

	return { queryStates, setQueryStates };
};

export const useProductQuery = () => {
	const { product_id } = useParams();
	const { queryStates } = useProductQueryState();
	const productId = queryStates.productId || product_id;

	const axiosInstance = useAxiosInstance();
	const { getCachedProduct } = useCachedProduct({ productId: productId });

	const cachedProduct = useMemo(getCachedProduct, [getCachedProduct]);

	const fetcher = async () => {
		if (!productId) return null;

		try {
			const url = `/products/${productId}/data`;
			const queryParams = {
				version: queryStates.version,
			};

			const { data } = await axiosInstance.get(url, { params: queryParams });
			return data;
		} catch (error) {
			throwBackendError(error);
		}
	};

	const { data, isLoading, refetch, error } = useQuery({
		queryKey: ["product", productId, queryStates.version],
		queryFn: fetcher,
		retry: false, // Don't retry on error (e.g., product not found)
		enabled: !!productId, // Only run query if productId exists
	});

	const { refetch: refetchCounts } = useProductCountsQuery();
	const { refetch: refetchMigrations } = useMigrationsQuery();

	const product = data?.product || cachedProduct;
	const isLoadingWithCache = cachedProduct ? false : isLoading;

	return {
		product,
		numVersions: data?.numVersions || cachedProduct?.version || 1,
		isLoading: isLoadingWithCache,
		refetch: async () => {
			await refetch();
			await Promise.all([refetchMigrations(), refetchCounts()]);
		},
		error,
	};
};
