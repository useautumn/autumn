import { ErrCode } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEventNames } from "./useEventNames";

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
	const featureIds = searchParams.get("feature_ids")?.split(",");
	const eventNames = searchParams.get("event_names")?.split(",");
	const interval = searchParams.get("interval");
	const groupBy = searchParams.get("group_by");
	const binSize = searchParams.get("bin_size");
	const maxGroups = Number(searchParams.get("max_groups")) || 10;

	const { eventNames: cachedEventNames } = useEventNames();

	const timezone = useMemo(() => getUserTimezone(), []);

	const { features: featuresData, isLoading: featuresLoading } =
		useFeaturesQuery();

	const formattedGroupBy = groupBy
		? groupBy === "customer_id" || groupBy === "entity_id"
			? groupBy
			: `properties.${groupBy}`
		: undefined;

	const selectedEventNames =
		eventNames || featureIds
			? [...(eventNames || []), ...(featureIds || [])]
			: cachedEventNames.slice(0, 3).map((e) => e.event_name);

	const postBody = {
		customer_id: customerId || undefined,
		entity_id: entityId || undefined,
		interval: interval || "30d",
		event_names: selectedEventNames,
		group_by: formattedGroupBy,
		bin_size: binSize || undefined,
		timezone,
		max_groups: formattedGroupBy ? maxGroups : undefined,
	};

	const {
		data,
		isLoading: queryLoading,
		error,
	} = useQuery({
		queryKey: buildKey([
			"query-events",
			customerId,
			entityId,
			interval || "30d",
			binSize || "day",
			...selectedEventNames.sort(),
			groupBy,
			timezone,
			String(maxGroups),
		]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/events", postBody);
			return data;
		},
	});

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
	};
};

export const useRawAnalyticsData = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const [searchParams] = useSearchParams();
	const customerId = searchParams.get("customer_id");
	const entityId = searchParams.get("entity_id");
	const interval = searchParams.get("interval");

	const { features: featuresData, isLoading: featuresLoading } =
		useFeaturesQuery();

	const postBody = {
		customer_id: customerId || undefined,
		entity_id: entityId || undefined,
		interval: interval || "30d",
	};

	const {
		data,
		isLoading: queryLoading,
		error,
	} = useQuery({
		queryKey: buildKey([
			"query-raw-events",
			customerId,
			entityId,
			interval || "30d",
		]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/raw", postBody);
			return data;
		},
	});

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
