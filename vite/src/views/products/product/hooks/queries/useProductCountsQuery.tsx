import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductQueryState } from "../useProductQuery";

export const useProductCountsQuery = () => {
	const axiosInstance = useAxiosInstance();
	const { product_id } = useParams();
	const { queryStates } = useProductQueryState();

	const productId = queryStates.productId || product_id;

	const fetchProductCounts = async () => {
		if (!productId) return null;
		const { data } = await axiosInstance.get(`/products/${productId}/count`, {
			params: {
				version: queryStates.version,
			},
		});
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["product_counts", productId, queryStates.version],
		queryFn: fetchProductCounts,
	});

	return { counts: data, isLoading, error, refetch };
};
