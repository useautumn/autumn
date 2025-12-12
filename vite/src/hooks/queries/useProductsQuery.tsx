import type { FullProduct, ProductCounts, ProductV2 } from "@autumn/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/**
 * Fetch all products for the current org.
 * Optionally provide a filter function to filter results.
 */
export const useProductsQuery = ({
	filter,
}: {
	filter?: (product: ProductV2) => boolean;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const fetchProducts = async () => {
		const { data } = await axiosInstance.get("/products/products");
		return data;
	};

	const fetchProductCounts = async () => {
		const { data } = await axiosInstance.get("/products/product_counts");
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery<{
		products: ProductV2[];
		groupToDefaults: Record<string, Record<string, FullProduct>>;
	}>({
		queryKey: ["products"],
		queryFn: fetchProducts,
	});

	const { data: countsData, refetch: countsRefetch } = useQuery<
		Record<string, ProductCounts>
	>({
		queryKey: ["product_counts"],
		queryFn: fetchProductCounts,
	});

	/**
	 * Invalidates all instances of products and product_counts queries across the app
	 */
	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["products"] }),
			queryClient.invalidateQueries({ queryKey: ["product_counts"] }),
		]);
	};

	return {
		products: (data?.products.filter(filter ?? (() => true)) ||
			[]) as ProductV2[],
		counts: countsData || {},
		groupToDefaults: data?.groupToDefaults || {},
		isLoading,
		error,
		refetch: async () => {
			await Promise.all([countsRefetch(), refetch()]);
		},
		invalidate,
	};
};
