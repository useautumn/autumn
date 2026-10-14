import type { ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export function useProductVersionQuery({
	productId,
	version,
	enabled,
}: {
	productId: string | undefined;
	version?: number;
	enabled?: boolean;
}) {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	return useQuery({
		queryKey: buildKey(["product-version", productId, version]),
		queryFn: async () => {
			const { data } = await axiosInstance.get(`/products/${productId}/data`, {
				params: version ? { version } : undefined,
			});
			return data as { product: ProductV2; numVersions: number };
		},
		enabled: enabled !== false && !!productId,
	});
}
