import type { CustomerWithProducts } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCustomersQueryStates } from "./useCustomersQueryStates";

export const useCusSearchQuery = () => {
	const { queryStates } = useCustomersQueryStates();

	const axiosInstance = useAxiosInstance();
	const fetcher = async () => {
		const { data } = await axiosInstance.post(`/customers/all/search`, {
			search: queryStates.q || "",
			filters: {
				status: queryStates.status,
				version: queryStates.version,
				none: queryStates.none,
			},
			page: queryStates.page,
			page_size: 50,
		});
		return { customers: data.customers, totalCount: data.totalCount };
	};

	const {
		data,
		isLoading,
		error,
		refetch,
		isRefetching,
		isFetching,
		isPending,
		isPlaceholderData,
	} = useQuery<{
		customers: CustomerWithProducts[];
		totalCount: number;
	}>({
		queryKey: [
			"customers",
			queryStates.page,
			queryStates.status,
			queryStates.version,
			queryStates.none,
			queryStates.q,
		],
		queryFn: fetcher,
		placeholderData: keepPreviousData,
	});

	const isFetchingUncached = Boolean(
		isPending || (isFetching && isPlaceholderData),
	);

	return {
		customers: data?.customers || [],
		totalCount: data?.totalCount || 0,
		isLoading,
		error,
		refetch,
		isRefetching,
		isFetchingUncached,
	};
};
