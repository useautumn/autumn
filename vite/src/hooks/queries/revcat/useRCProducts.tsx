import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface RevenueCatProduct {
	id: string;
	name: string;
	storeIdentifier: string;
}

interface RevenueCatProductsResponse {
	products: RevenueCatProduct[];
}

export const useRCProducts = () => {
	const axiosInstance = useAxiosInstance();

	const fetcher = async () => {
		try {
			const { data }: { data: RevenueCatProductsResponse } =
				await axiosInstance.post("/v1/organization/revenuecat/products");

			return data.products || [];
		} catch (_error) {
			return [];
		}
	};

	const { data: products = [], isLoading, error, refetch } = useQuery({
		queryKey: ["revenuecat-products"],
		queryFn: fetcher,
	});

	return {
		products,
		isLoading,
		error,
		refetch,
	};
};
