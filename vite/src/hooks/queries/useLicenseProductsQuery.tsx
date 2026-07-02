import type { ProductV2 } from "@autumn/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const EMPTY_PRODUCTS: ProductV2[] = [];

/**
 * Fetch license subplans (catalog_type='license'). These are excluded from the
 * normal `/products/products` list, so they need their own route.
 */
export const useLicenseProductsQuery = ({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery<{
		products: ProductV2[];
	}>({
		queryKey: buildKey(["license_products"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get("/products/license_products");
			return data;
		},
		enabled,
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["license_products"] });

	return {
		licenseProducts: data?.products ?? EMPTY_PRODUCTS,
		isLoading,
		error,
		refetch,
		invalidate,
	};
};
