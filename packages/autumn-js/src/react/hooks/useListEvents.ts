"use client";

import { useQuery } from "@tanstack/react-query";
import type { ListEventsResponse } from "@useautumn/sdk";
import { useCallback, useMemo, useState } from "react";
import type { ListEventsParams } from "../../types";
import { useAutumnClient } from "../AutumnContext";
import type { AutumnClientError } from "../client/AutumnClientError";
import type { HookParams } from "./types";

export type UseListEventsParams = HookParams<
	ListEventsParams,
	ListEventsResponse
>;

export const useListEvents = (params: UseListEventsParams = {}) => {
	const client = useAutumnClient();
	const {
		queryOptions,
		limit: passedLimit,
		customRange,
		...restParams
	} = params;

	const limit = passedLimit ?? 100;
	const [page, setPage] = useState(0);
	const offset = page * limit;

	const startDate = customRange?.start
		? new Date(customRange.start).toISOString().slice(0, 13)
		: undefined;
	const endDate = customRange?.end
		? new Date(customRange.end).toISOString().slice(0, 13)
		: undefined;

	const query = useQuery<ListEventsResponse, AutumnClientError>({
		queryKey: [
			"autumn",
			"events",
			"list",
			restParams.featureId,
			startDate,
			endDate,
			offset,
			limit,
		],
		queryFn: () =>
			client.listEvents({
				...restParams,
				customRange,
				offset,
				limit,
			}),
		...queryOptions,
	});

	const hasMore = query.data?.hasMore ?? false;
	const hasPrevious = page > 0;

	const nextPage = useCallback(() => {
		if (!hasMore) return;
		setPage((currentPage) => currentPage + 1);
	}, [hasMore]);

	const prevPage = useCallback(() => {
		if (!hasPrevious) return;
		setPage((currentPage) => currentPage - 1);
	}, [hasPrevious]);

	const goToPage = useCallback(({ pageNum }: { pageNum: number }) => {
		setPage(Math.max(0, pageNum));
	}, []);

	const resetPagination = useCallback(() => {
		setPage(0);
	}, []);

	return useMemo(
		() => ({
			...query,
			list: query.data?.list,
			hasMore,
			hasPrevious,
			page,
			nextPage,
			prevPage,
			goToPage,
			resetPagination,
		}),
		[
			query,
			hasMore,
			hasPrevious,
			page,
			nextPage,
			prevPage,
			goToPage,
			resetPagination,
		],
	);
};
