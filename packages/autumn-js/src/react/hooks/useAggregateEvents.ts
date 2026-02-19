"use client";

import { useQuery } from "@tanstack/react-query";
import type { AggregateEventsResponse } from "@useautumn/sdk";
import { useMemo } from "react";
import type { AggregateEventsParams } from "../../types";
import { useAutumnClient } from "../AutumnContext";
import type { AutumnClientError } from "../client/AutumnClientError";
import type { HookParams } from "./types";

export type UseAggregateEventsParams = HookParams<
	AggregateEventsParams,
	AggregateEventsResponse
>;

export const useAggregateEvents = (params: UseAggregateEventsParams) => {
	const client = useAutumnClient();
	const { queryOptions, customRange, ...restParams } = params;

	const startDate = customRange?.start
		? new Date(customRange.start).toISOString().slice(0, 13)
		: undefined;
	const endDate = customRange?.end
		? new Date(customRange.end).toISOString().slice(0, 13)
		: undefined;

	const query = useQuery<AggregateEventsResponse, AutumnClientError>({
		queryKey: [
			"autumn",
			"events",
			"aggregate",
			restParams.featureId,
			restParams.groupBy,
			restParams.range,
			restParams.binSize,
			startDate,
			endDate,
		],
		queryFn: () =>
			client.aggregateEvents({
				...restParams,
				customRange,
			}),
		...queryOptions,
	});

	return useMemo(
		() => ({
			...query,
			list: query.data?.list,
			total: query.data?.total,
		}),
		[query],
	);
};
