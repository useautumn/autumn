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
	const client = useAutumnClient({ caller: "useListEvents" });
	const {
		queryOptions,
		limit: passedLimit,
		startCursor: passedStartCursor,
		customRange,
		...restParams
	} = params;

	const limit = passedLimit ?? 100;
	const initialStartCursor = passedStartCursor ?? "";
	const paginationKey = JSON.stringify({
		...restParams,
		customRange,
		limit,
		initialStartCursor,
	});
	const [paginationState, setPaginationState] = useState({
		key: paginationKey,
		page: 0,
		startCursors: [initialStartCursor],
	});
	const pagination =
		paginationState.key === paginationKey
			? paginationState
			: {
					key: paginationKey,
					page: 0,
					startCursors: [initialStartCursor],
				};
	const startCursor = pagination.startCursors[pagination.page] ?? initialStartCursor;

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
			restParams.entityId,
			startDate,
			endDate,
			startCursor,
			limit,
		],
		queryFn: () =>
			client.listEvents({
				...restParams,
				customRange,
				startCursor,
				limit,
			}),
		...queryOptions,
	});

	const hasMore = query.data?.nextCursor !== null && query.data?.nextCursor !== undefined;
	const hasPrevious = pagination.page > 0;

	const nextPage = useCallback(() => {
		if (!hasMore) return;
		setPaginationState((current) => {
			const activeState =
				current.key === paginationKey
					? current
					: {
							key: paginationKey,
							page: 0,
							startCursors: [initialStartCursor],
						};
			const startCursors = activeState.startCursors.slice(
				0,
				activeState.page + 1,
			);
			startCursors[activeState.page + 1] = query.data?.nextCursor ?? "";

			return {
				key: paginationKey,
				page: activeState.page + 1,
				startCursors,
			};
		});
	}, [hasMore, initialStartCursor, paginationKey, query.data?.nextCursor]);

	const prevPage = useCallback(() => {
		if (!hasPrevious) return;
		setPaginationState((current) => {
			const activeState = current.key === paginationKey ? current : pagination;

			return {
				...activeState,
				page: Math.max(0, activeState.page - 1),
			};
		});
	}, [hasPrevious, pagination, paginationKey]);

	const goToPage = useCallback(({ pageNum }: { pageNum: number }) => {
		setPaginationState((current) => {
			const activeState = current.key === paginationKey ? current : pagination;

			return {
				...activeState,
				page: Math.max(
					0,
					Math.min(pageNum, activeState.startCursors.length - 1),
				),
			};
		});
	}, [pagination, paginationKey]);

	const resetPagination = useCallback(() => {
		setPaginationState({
			key: paginationKey,
			page: 0,
			startCursors: [initialStartCursor],
		});
	}, [initialStartCursor, paginationKey]);

	return useMemo(
		() => ({
			...query,
			list: query.data?.list,
			hasMore,
			hasPrevious,
			page: pagination.page,
			nextPage,
			prevPage,
			goToPage,
			resetPagination,
		}),
		[
			query,
			hasMore,
			hasPrevious,
			pagination.page,
			nextPage,
			prevPage,
			goToPage,
			resetPagination,
		],
	);
};
