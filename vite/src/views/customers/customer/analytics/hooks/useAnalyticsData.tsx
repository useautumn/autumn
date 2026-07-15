import { ErrCode } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useAnalyticsQueryState } from "./useAnalyticsQueryState";
import { useSelectedEventNames } from "./useSelectedEventNames";

/** Gets the user's IANA timezone (e.g., "America/New_York") */
const getUserTimezone = (): string => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return "UTC";
	}
};

export const useAnalyticsData = ({
	hasCleared = false,
}: {
	hasCleared?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const [searchParams] = useSearchParams();
	const customerId = searchParams.get("customer_id");
	const entityId = searchParams.get("entity_id");
	const groupBy = searchParams.get("group_by");
	const maxGroups = Number(searchParams.get("max_groups")) || 10;

	const { queryStates } = useAnalyticsQueryState();
	const { interval, bin_size: binSize, start, end } = queryStates;
	const customRange =
		interval === "custom" && start && end ? { start, end } : undefined;

	const {
		selectedEventNames,
		featuresData,
		featuresLoading,
		eventNamesLoading,
	} = useSelectedEventNames();

	const timezone = useMemo(() => getUserTimezone(), []);

	const formattedGroupBy = groupBy
		? groupBy === "customer_id" ||
			groupBy === "entity_id" ||
			groupBy === "plan_id"
			? groupBy
			: `properties.${groupBy}`
		: undefined;

	const postBody = {
		customer_id: customerId || undefined,
		entity_id: entityId || undefined,
		interval: customRange ? undefined : interval,
		custom_range: customRange,
		event_names: selectedEventNames,
		group_by: formattedGroupBy,
		bin_size: binSize || undefined,
		timezone,
		max_groups: formattedGroupBy ? maxGroups : undefined,
	};

	const isReady = !eventNamesLoading && !featuresLoading;

	const { data, isLoading, error } = useQuery({
		enabled: isReady,
		queryKey: buildKey([
			"query-events",
			customerId,
			entityId,
			interval,
			binSize || "day",
			String(start ?? ""),
			String(end ?? ""),
			...selectedEventNames.sort(),
			groupBy,
			timezone,
			String(maxGroups),
		]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/events", postBody);
			return data;
		},
		staleTime: 30 * 1000,
		refetchOnWindowFocus: true,
	});

	const queryLoading = !isReady || isLoading;

	return {
		customer: data?.customer,
		features: featuresData || [],
		featuresLoading,
		queryLoading,
		events: data?.events,
		error:
			error && (error as any)?.code === ErrCode.ClickHouseDisabled
				? null
				: error,
		bcExclusionFlag: data?.bcExclusionFlag ?? false,
		groupBy,
		truncated: data?.truncated ?? false,
		entityNames: (data?.entityNames as Record<string, string>) ?? undefined,
		customerNames: (data?.customerNames as Record<string, string>) ?? undefined,
		planNames: (data?.planNames as Record<string, string>) ?? undefined,
		totals:
			(data?.totals as
				| Record<string, { count: number; sum: number }>
				| undefined) ?? undefined,
		eventNames: (data?.eventNames as string[] | undefined) ?? [],
	};
};

export const useRawAnalyticsData = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const [searchParams] = useSearchParams();
	const customerId = searchParams.get("customer_id");
	const entityId = searchParams.get("entity_id");

	const { queryStates } = useAnalyticsQueryState();
	const { interval, start, end } = queryStates;
	const customRange =
		interval === "custom" && start && end ? { start, end } : undefined;

	const {
		selectedEventNames,
		hasExplicitSelection,
		featuresData,
		featuresLoading,
		eventNamesLoading,
	} = useSelectedEventNames();

	const isReady = !eventNamesLoading && !featuresLoading;

	const tableEventNames = hasExplicitSelection ? selectedEventNames : undefined;

	const postBody = {
		customer_id: customerId || undefined,
		entity_id: entityId || undefined,
		interval: customRange ? undefined : interval,
		custom_range: customRange,
		event_names: tableEventNames,
	};

	const { data, isLoading, error } = useQuery({
		enabled: isReady,
		queryKey: buildKey([
			"query-raw-events",
			customerId,
			entityId,
			interval,
			String(start ?? ""),
			String(end ?? ""),
			...(tableEventNames ?? []).sort(),
		]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/raw", postBody);
			return data;
		},
		staleTime: 30 * 1000,
		refetchOnWindowFocus: true,
	});

	const queryLoading = !isReady || isLoading;

	return {
		customer: data?.customer,
		features: featuresData || [],
		featuresLoading,
		queryLoading,
		rawEvents: data?.rawEvents,
		error:
			error && (error as any)?.code === ErrCode.ClickHouseDisabled
				? null
				: error,
	};
};
