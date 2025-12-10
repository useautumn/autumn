import type { FullCustomer } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCustomersQueryStates } from "./useCustomersQueryStates";

export const useFullCusSearchQuery = () => {
	const { queryStates } = useCustomersQueryStates();
	const axiosInstance = useAxiosInstance();

	const { refetch } = useQuery<{
		fullCustomers: FullCustomer[];
	}>({
		queryKey: ["full_customers"],
		// Pass AbortSignal so previous requests are canceled when a new refetch starts
		queryFn: async ({ signal }) => {
			const { data } = await axiosInstance.post(
				`/customers/all/full_customers`,
				{
					search: queryStates.q,
					page_size: 30,
					page: queryStates.page,
					filters: {
						status: queryStates.status,
						version: queryStates.version,
						none: queryStates.none,
					},
				},
				{ signal },
			);

			// console.log(`Fetched ${data?.fullCustomers.length} full customers`);
			return data;
		},
		placeholderData: keepPreviousData,
		enabled: false,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		staleTime: Infinity,
	});

	useEffect(() => {
		// One controlled refetch per dependency change
		refetch();
	}, [
		// Trigger on all state changes that affect the payload
		queryStates.page,
		queryStates.status,
		queryStates.version,
		queryStates.none,
		queryStates.q,
		refetch,
	]);
};
