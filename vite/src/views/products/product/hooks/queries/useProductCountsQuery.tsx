import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductQueryState } from "../useProductQuery";

export const useProductCountsQuery = ({
	version,
}: {
	version?: number;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { product_id } = useParams();
	const { queryStates } = useProductQueryState();
	const product = useProductStore((s) => s.product);

	const productId = product?.id || queryStates.productId || product_id;

	const fetchProductCounts = async () => {
		if (!productId) return null;
		const { data } = await axiosInstance.get(`/products/${productId}/count`, {
			...(version ? { params: { version } } : {}),
		});
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["product_counts", productId, version]),
		queryFn: fetchProductCounts,
		retry: false,
		enabled: !!productId,
	});

	return { counts: data, isLoading, error, refetch };
};
