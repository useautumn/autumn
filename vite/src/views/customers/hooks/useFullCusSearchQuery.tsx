import type { FullCustomer } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCustomersQueryStates } from "./useCustomersQueryStates";

export const FULL_CUSTOMERS_QUERY_KEY = "full_customers";

export const useFullCusSearchQuery = () => {
	const { queryStates } = useCustomersQueryStates();
	const axiosInstance = useAxiosInstance();

	return useQuery<{
		fullCustomers: FullCustomer[];
	}>({
		queryKey: [
			FULL_CUSTOMERS_QUERY_KEY,
			queryStates.page,
			queryStates.pageSize,
			queryStates.status,
			queryStates.version,
			queryStates.none,
			queryStates.q,
		],
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
					},
				},
				{ signal },
			);

			return data;
		},
		placeholderData: keepPreviousData,
		refetchOnWindowFocus: false,
	});
};
