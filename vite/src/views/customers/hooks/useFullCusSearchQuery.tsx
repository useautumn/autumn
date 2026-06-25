import type { FullCustomer } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import {
	buildCustomerFilterPayload,
	useCustomerFilters,
} from "./useCustomerFilters";

export const FULL_CUSTOMERS_QUERY_KEY = "full_customers";

export const useFullCusSearchQuery = () => {
	const { queryStates, isInitialized, currentCursor } = useCustomerFilters();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery<{
		fullCustomers: FullCustomer[];
		next_cursor: string | null;
	}>({
		queryKey: buildKey([
			FULL_CUSTOMERS_QUERY_KEY,
			currentCursor,
			queryStates.pageSize,
			queryStates.status,
			queryStates.version,
			queryStates.none,
			queryStates.processor,
			queryStates.interval,
			queryStates.q,
		]),
		queryFn: async ({ signal }) => {
			const { data } = await axiosInstance.post(
				`/customers/all/full_customers`,
				{
					search: queryStates.q,
					cursor: currentCursor,
					limit: queryStates.pageSize,
					filters: buildCustomerFilterPayload(queryStates),
				},
				{ signal },
			);
			return {
				fullCustomers: data.fullCustomers,
				next_cursor: data.next_cursor ?? null,
			};
		},
		enabled: isInitialized,
		placeholderData: keepPreviousData,
		refetchOnWindowFocus: false,
	});
};
