import type { CustomerWithProducts } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCustomerFilters } from "./useCustomerFilters";

export const useCusSearchQuery = () => {
	const { queryStates, isInitialized, currentCursor } = useCustomerFilters();
	const trimmedSearch = queryStates.q.trim();

	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const fetcher = async () => {
		const { data } = await axiosInstance.post(`/customers/all/search`, {
			search: trimmedSearch,
			cursor: currentCursor,
			limit: queryStates.pageSize,
			filters: {
				status: queryStates.status,
				version: queryStates.version,
				none: queryStates.none,
				processor: queryStates.processor,
			},
		});
		return {
			customers: data.customers as CustomerWithProducts[],
			next_cursor: (data.next_cursor ?? null) as string | null,
		};
	};

	const countFetcher = async () => {
		const { data } = await axiosInstance.post(`/customers/all/count`, {
			search: trimmedSearch,
			filters: {
				status: queryStates.status,
				version: queryStates.version,
				none: queryStates.none,
				processor: queryStates.processor,
			},
		});
		return data.totalCount as number;
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
	} = useQuery({
		queryKey: buildKey([
			"customers",
			currentCursor,
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

	const { data: totalCount, isLoading: isCountLoading } = useQuery({
		queryKey: buildKey([
			"customers-count",
			queryStates.status,
			queryStates.version,
			queryStates.none,
			queryStates.processor,
			trimmedSearch,
		]),
		queryFn: countFetcher,
		enabled: isInitialized,
		placeholderData: keepPreviousData,
	});

	const isFetchingUncached = Boolean(
		isPending || (isFetching && isPlaceholderData),
	);

	return {
		customers: data?.customers || [],
		nextCursor: data?.next_cursor ?? null,
		totalCount: totalCount ?? 0,
		isLoading: isLoading || isCountLoading,
		error,
		refetch,
		isRefetching,
		isFetchingUncached,
	};
};

export const useCusSearchQueryV2 = ({
	search,
	filters = {},
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
			cursor: "",
			limit: page_size || 30,
			filters: {
				status: filters.status ? [filters.status] : undefined,
				version: filters.version ? [filters.version] : undefined,
				none: filters.none === "true" ? true : undefined,
			},
		});
		return {
			customers: data.customers as CustomerWithProducts[],
			next_cursor: (data.next_cursor ?? null) as string | null,
		};
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
	} = useQuery({
		queryKey: buildKey([
			"customers",
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
		nextCursor: data?.next_cursor ?? null,
		totalCount: 0,
		isLoading,
		error,
		refetch,
		isRefetching,
		isFetchingUncached,
	};
};
