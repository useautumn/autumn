import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { throwBackendError } from "@/utils/genUtils";
import { useCachedCustomer } from "./useCachedCustomer";

export const useCusQuery = ({ enabled = true }: { enabled?: boolean } = {}) => {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance();
	const { getCachedCustomer } = useCachedCustomer(customer_id);

	const cachedCustomer = useMemo(getCachedCustomer, [getCachedCustomer]);

	const fetcher = async () => {
		try {
			const { data } = await axiosInstance.get(`/customers/${customer_id}`);
			return data;
		} catch (error) {
			throwBackendError(error);
		}
	};

	const {
		data,
		isLoading: customerLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["customer", customer_id],
		queryFn: fetcher,
		enabled: enabled && !!customer_id,
		retry: false,
	});

	const { products, isLoading: productsLoading } = useProductsQuery();
	const { features, isLoading: featuresLoading } = useFeaturesQuery();

	const customer = data?.customer || cachedCustomer;
	const cusWithCacheLoading = cachedCustomer ? false : customerLoading;

	return {
		customer: customer,
		entities: customer?.entities,
		products,
		features,
		isLoading: cusWithCacheLoading || productsLoading || featuresLoading,
		error,
		refetch,
	};

	// const { data, isLoading, error } = useQuery({
	//   queryKey: ["customer", customerId],
	//   queryFn: fetcher,
	// });
};
