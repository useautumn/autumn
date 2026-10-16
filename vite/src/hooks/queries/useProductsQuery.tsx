import type {
	AppEnv,
	FullProduct,
	ProductCounts,
	ProductV2,
} from "@autumn/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { PERSIST_META } from "@/lib/queryPersistence";
import { useAxiosInstance } from "@/services/useAxiosInstance";

// Stable empty object reference to prevent infinite re-renders
const EMPTY_COUNTS: Record<string, ProductCounts> = {};

export type ProductListItem = ProductV2 &
	Pick<FullProduct, "licenses" | "parent_plan_licenses">;

/**
 * Fetch all products for the current org.
 *
 * Pass `allVersions: true` to include every version of each plan (the default
 * route only returns the latest per public id). `env` reads another env's catalog.
 */
export const useProductsQuery = ({
	allVersions = false,
	enabled = true,
	env,
}: {
	allVersions?: boolean;
	enabled?: boolean;
	env?: AppEnv;
} = {}) => {
	const axiosInstance = useAxiosInstance({ env });
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory({ env });

	const fetchProducts = async () => {
		const { data } = await axiosInstance.get("/products/products", {
			params: allVersions ? { all_versions: true } : undefined,
		});
		return data;
	};

	const fetchProductCounts = async () => {
		const { data } = await axiosInstance.get("/products/product_counts");
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery<{
		products: ProductListItem[];
		groupToDefaults: Record<string, Record<string, FullProduct>>;
	}>({
		queryKey: buildKey(["products", allVersions ? "all" : "latest"]),
		queryFn: fetchProducts,
		enabled,
		meta: PERSIST_META,
	});

	const {
		data: countsData,
		isLoading: isCountsLoading,
		refetch: countsRefetch,
	} = useQuery<Record<string, ProductCounts>>({
		queryKey: buildKey(["product_counts"]),
		queryFn: fetchProductCounts,
		enabled,
		meta: PERSIST_META,
	});

	/**
	 * Invalidates all instances of products and product_counts queries across the app
	 */
	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["products"] }),
			queryClient.invalidateQueries({ queryKey: ["product_counts"] }),
			queryClient.invalidateQueries({ queryKey: ["product_versions"] }),
		]);
	};

	return {
		products: data?.products || [],
		counts: countsData ?? EMPTY_COUNTS,
		groupToDefaults: data?.groupToDefaults || {},
		isLoading,
		isCountsLoading,
		error,
		refetch: async () => {
			await Promise.all([countsRefetch(), refetch()]);
		},
		invalidate,
	};
};
