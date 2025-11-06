import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductQueryState } from "../useProductQuery";

export const useProductCountsQuery = ({
	version,
}: {
	version?: number;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const { product_id } = useParams();
	const { queryStates } = useProductQueryState();
	const product = useProductStore((s) => s.product);

	// Prefer store product ID, fallback to query state, then route params
	const productId = product?.id || queryStates.productId || product_id;

	const fetchProductCounts = async () => {
		if (!productId) return null;
		// Always get counts for the latest version (don't pass version param)
		// This ensures we check if the CURRENT version has customers, not older versions
		const { data } = await axiosInstance.get(`/products/${productId}/count`, {
			...(version ? { params: { version } } : {}),
		});
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["product_counts", productId, version],
		queryFn: fetchProductCounts,
		retry: false, // Don't retry on error (e.g., product not found)
		enabled: !!productId, // Only run query if productId exists
	});

	return { counts: data, isLoading, error, refetch };
};
