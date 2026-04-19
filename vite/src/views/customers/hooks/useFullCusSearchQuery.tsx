import type { FullCustomer } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCustomerFilters } from "./useCustomerFilters";

export const FULL_CUSTOMERS_QUERY_KEY = "full_customers";

export const useFullCusSearchQuery = () => {
	const { queryStates, isInitialized } = useCustomerFilters();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery<{
		fullCustomers: FullCustomer[];
	}>({
		queryKey: buildKey([
			FULL_CUSTOMERS_QUERY_KEY,
			queryStates.page,
			queryStates.pageSize,
			queryStates.status,
			queryStates.version,
			queryStates.none,
			queryStates.processor,
			queryStates.q,
		]),
		queryFn: async ({ signal }) => {
			const { data } = await axiosInstance.post(
				`/customers/all/full_customers`,
				{
					search: queryStates.q,
					page_size: queryStates.pageSize,
					page: queryStates.page,
					filters: {
						status: queryStates.status,
						version: queryStates.version,
						none: queryStates.none,
						processor: queryStates.processor,
					},
				},
				{ signal },
			);

			return data;
		},
		enabled: isInitialized,
		placeholderData: keepPreviousData,
		refetchOnWindowFocus: false,
	});
};
