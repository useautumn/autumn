import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface RevenueCatProduct {
	id: string;
	name: string;
}

interface RevenueCatProductsResponse {
	products: RevenueCatProduct[];
}

export const useRCProducts = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const fetcher = async () => {
		try {
			const { data }: { data: RevenueCatProductsResponse } =
				await axiosInstance.post("/v1/organization/revenuecat/products");

			return data.products || [];
		} catch (_error) {
			return [];
		}
	};

	const {
		data: products = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: buildKey(["revenuecat-products"]),
		queryFn: fetcher,
	});

	return {
		products,
		isLoading,
		error,
		refetch,
	};
};
