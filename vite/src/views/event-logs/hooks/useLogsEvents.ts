import {
	type ApiEventsListItem,
	type CursorPaginatedResponse,
	LATEST_VERSION,
} from "@autumn/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toFilterBy, useLogsFilters } from "./useLogsFilters";

const PAGE_SIZE = 100;
const LIVE_REFRESH_MS = 5_000;

/** Newest-first events for the current Logs filters, a page at a time. */
export const useLogsEvents = () => {
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();
	const { filters } = useLogsFilters();
	const filterBy = toFilterBy({ properties: filters.properties });

	const query = useInfiniteQuery({
		queryKey: buildKey([
			"logs-events",
			filters.feature_id,
			filters.customer_id,
			filters.range,
			...filters.properties,
		]),
		initialPageParam: undefined as string | undefined,
		queryFn: async ({ pageParam }) => {
			const { data } = await axiosInstance.post<
				CursorPaginatedResponse<ApiEventsListItem>
			>("/v1/events.list", {
				customer_id: filters.customer_id || undefined,
				feature_id: filters.feature_id || undefined,
				range: filters.range,
				filter_by: filterBy,
				limit: PAGE_SIZE,
				start_cursor: pageParam,
			});
			return data;
		},
		getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
		refetchInterval: filters.live ? LIVE_REFRESH_MS : false,
		staleTime: 30 * 1000,
	});

	const events = useMemo(
		() => query.data?.pages.flatMap((page) => page.list) ?? [],
		[query.data],
	);

	return {
		events,
		isLoading: query.isLoading,
		error: query.error,
		hasNextPage: query.hasNextPage,
		isFetchingNextPage: query.isFetchingNextPage,
		fetchNextPage: query.fetchNextPage,
	};
};
