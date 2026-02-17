import type { ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Fetches product data for a specific version (or latest if version is omitted). */
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
	return useQuery({
		queryKey: ["product-version", productId, version],
		queryFn: async () => {
			const { data } = await axiosInstance.get(`/products/${productId}/data`, {
				params: version ? { version } : undefined,
			});
			return data as { product: ProductV2; numVersions: number };
		},
		enabled: enabled !== false && !!productId,
	});
}
