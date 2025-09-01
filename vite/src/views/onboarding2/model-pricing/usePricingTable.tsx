import { useAxiosSWR } from "@/services/useAxiosSwr";

export const useListProducts = ({ customerId }: { customerId: string }) => {
	const { data, isLoading, error, mutate } = useAxiosSWR({
		url: `/v1/products?customer_id=${customerId}`,
		options: {
			refreshInterval: 0,
		},
	});

	return {
		products: data?.list || [],
		isLoading,
		error,
		mutate,
	};
};
