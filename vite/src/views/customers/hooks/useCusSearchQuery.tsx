import type { CustomerWithProducts } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCustomerFilters } from "./useCustomerFilters";

export const useCusSearchQuery = () => {
	const { queryStates, isInitialized } = useCustomerFilters();
	const trimmedSearch = queryStates.q.trim();

	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const fetcher = async () => {
		const { data } = await axiosInstance.post(`/customers/all/search`, {
			search: trimmedSearch,
			filters: {
				status: queryStates.status,
				version: queryStates.version,
				none: queryStates.none,
				processor: queryStates.processor,
			},
			page: queryStates.page,
			page_size: queryStates.pageSize,
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
		queryKey: buildKey([
			"customers",
			queryStates.page,
			queryStates.pageSize,
			queryStates.status,
			queryStates.version,
			queryStates.none,
			queryStates.processor,
			trimmedSearch,
		]),
		queryFn: fetcher,
		enabled: isInitialized,
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

export const useCusSearchQueryV2 = ({
	search,
	filters = {},
	page,
	page_size,
}: {
	search: string;
	filters?: {
		status?: string;
		version?: string;
		none?: string;
	};
	page?: number;
	page_size: number;
}) => {
	const trimmedSearch = search.trim();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const fetcher = async () => {
		const { data } = await axiosInstance.post(`/customers/all/search`, {
			search: trimmedSearch,
			filters: {
				status: filters.status,
				version: filters.version,
				none: filters.none,
			},
			page: page || 1,
			page_size: page_size || 30,
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
		queryKey: buildKey([
			"customers",
			page,
			page_size,
			filters?.status,
			filters?.version,
			filters?.none,
			trimmedSearch,
		]),
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
