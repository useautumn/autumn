import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useMemo } from "react";
import { useParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
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
	const queryClient = useQueryClient();
	const { getCachedProduct } = useCachedProduct({ productId: productId });

	const cachedProduct = useMemo(getCachedProduct, []);

	const fetcher = async () => {
		if (!productId) return null;

		const url = `/products/${productId}/data2`;
		const queryParams: { version?: number } = {};

		// Only include version if it's explicitly set, otherwise fetch latest
		if (queryStates.version) {
			queryParams.version = queryStates.version;
		}

		const { data } = await axiosInstance.get(url, { params: queryParams });
		return data;
	};

	const { data, isLoading, refetch, error } = useQuery({
		queryKey: ["product", productId, queryStates.version],
		queryFn: fetcher,
		retry: 1, // Fail faster - only retry once instead of default 3 times
		retryDelay: 500, // Short delay between retries
	});

	const { refetch: refetchCounts } = useProductCountsQuery();
	const { refetch: refetchMigrations } = useMigrationsQuery();

	const product = data?.product || cachedProduct;
	const isLoadingWithCache = cachedProduct ? false : isLoading;

	/**
	 * Invalidates all individual product queries across the app
	 */
	const invalidate = async () => {
		await queryClient.invalidateQueries({ queryKey: ["product"] });
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["product_counts"] }),
			queryClient.invalidateQueries({ queryKey: ["migrations"] }),
		]);
	};

	return {
		product,
		numVersions: data?.numVersions || cachedProduct?.version || 1,
		isLoading: isLoadingWithCache,
		refetch: async () => {
			await refetch();
			await Promise.all([refetchMigrations(), refetchCounts()]);
		},
		invalidate,
		error,
	};
};
