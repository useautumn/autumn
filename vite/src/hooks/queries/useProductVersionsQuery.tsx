import type { ProductV2 } from "@autumn/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const EMPTY_VERSIONS: ProductV2[] = [];

export const useProductVersionsQuery = ({
	productId,
	enabled = false,
}: {
	productId: string | undefined;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading, error, refetch } = useQuery<ProductV2[]>({
		queryKey: buildKey(["product_versions", productId]),
		queryFn: async () => {
			const { data } = await axiosInstance.get<{ products: ProductV2[] }>(
				"/products/products",
				{
					params: { all_versions: true, product_id: productId },
				},
			);
			return data.products;
		},
		enabled: enabled && !!productId,
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["product_versions"] });

	return {
		versions: data ?? EMPTY_VERSIONS,
		isLoading,
		error,
		refetch,
		invalidate,
	};
};
