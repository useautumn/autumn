import { ErrCode } from "@autumn/shared";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useAxiosSWR, usePostSWR } from "@/services/useAxiosSwr";
import { useEnv } from "@/utils/envUtils";
import { useEventNames } from "./useEventNames";
import { useTopEventNames } from "./useTopEventNames";

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
	const { org } = useOrg();

	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const customerId = searchParams.get("customer_id");
	const featureIds = searchParams.get("feature_ids")?.split(",");
	const eventNames = searchParams.get("event_names")?.split(",");
	const interval = searchParams.get("interval");
	const groupBy = searchParams.get("group_by");
	const binSize = searchParams.get("bin_size");

	const { topEvents, isLoading: topEventsLoading } = useTopEventNames();
	const { eventNames: cachedEventNames } = useEventNames();

	// Get user's timezone - memoized since it won't change during session
	const timezone = useMemo(() => getUserTimezone(), []);

	// const { data: featuresData, isLoading: featuresLoading } = useAxiosSWR({
	// 	url: `/features`,
	// 	options: {
	// 		refreshInterval: 0,
	// 	},
	// });
	const { features: featuresData, isLoading: featuresLoading } =
		useFeaturesQuery();

	// Format group_by for API (must be prefixed with "properties." except for customer_id)
	const formattedGroupBy = groupBy
		? groupBy === "customer_id"
			? "customer_id"
			: `properties.${groupBy}`
		: undefined;

	// Use selected event names, or fall back to top 3 cached event names
	const selectedEventNames = eventNames || featureIds
		? [...(eventNames || []), ...(featureIds || [])]
		: cachedEventNames.slice(0, 3).map((e) => e.event_name);

	// Create a simple queryKey with the actual values that change
	const queryKey = [
		customerId,
		interval || "30d",
		binSize || "day",
		...selectedEventNames.sort(),
		org?.slug,
		groupBy,
		timezone,
	];

	const {
		data,
		isLoading: queryLoading,
		error,
	} = usePostSWR({
		url: `/query/events`,
		data: {
			customer_id: customerId || undefined,
			interval: interval || "30d",
			event_names: selectedEventNames,
			group_by: formattedGroupBy,
			bin_size: binSize || undefined,
			timezone,
		},
		queryKey: ["query-events", ...queryKey],
		options: {
			refreshInterval: 0,
			onError: (error) => {
				if (error.code === ErrCode.ClickHouseDisabled) {
					return error;
				}
			},
		},
	});

	return {
		customer: data?.customer,
		features: featuresData || [],
		featuresLoading,
		queryLoading,
		events: data?.events,
		topEvents: data?.topEvents,
		error: error?.code === ErrCode.ClickHouseDisabled ? null : error,
		bcExclusionFlag: data?.bcExclusionFlag ?? false,
		topEventsLoading,
		groupBy,
		truncated: data?.truncated ?? false,
	};
};

export const useRawAnalyticsData = () => {
	const { org } = useOrg();
	const env = useEnv();

	const [searchParams] = useSearchParams();
	const customerId = searchParams.get("customer_id");
	const interval = searchParams.get("interval");

	const { data: featuresData, isLoading: featuresLoading } = useAxiosSWR({
		url: `/features`,
		queryKey: [org?.slug, env],
		options: {
			refreshInterval: 0,
		},
	});

	// Create a simple queryKey with the actual values that change
	const queryKey = [
		"query-raw-events",
		customerId,
		interval || "30d",
		org?.slug,
		env,
	];

	const {
		data,
		isLoading: queryLoading,
		error,
	} = usePostSWR({
		url: `/query/raw`,
		data: {
			customer_id: customerId || undefined,
			interval: interval || "30d",
		},
		queryKey,
		options: {
			refreshInterval: 0,
			onError: (error) => {
				if (error.code === ErrCode.ClickHouseDisabled) {
					return error;
				}
			},
		},
	});

	return {
		customer: data?.customer,
		features: featuresData?.features || [],
		featuresLoading,

		queryLoading,
		rawEvents: data?.rawEvents,
		error: error?.code === ErrCode.ClickHouseDisabled ? null : error,
	};
};

// const {
//   data: eventNamesData,
//   isLoading: eventNamesLoading,
//   error: eventNamesError,
// } = usePostSWR({
//   method: "get",
//   url: `/query/event_names`,
//   enabled: nullish(eventNames) && nullish(featureIds),
//   queryKey: ["query-event-names", ...queryKey],
//   options: {
//     refreshInterval: 0,
//     onError: (error) => {
//       if (error.code === ErrCode.ClickHouseDisabled) {
//         return error;
//       }
//     },
//   },
// });

// useEffect(() => {
//   if (eventNamesData && !hasCleared) {
//     searchParams.set("event_names", eventNamesData.eventNames.join(","));
//     searchParams.set("feature_ids", eventNamesData.featureIds.join(","));

//     navigate(`?${searchParams.toString()}`);
//   }
// }, [eventNamesData, searchParams, hasCleared, navigate]);

// const hasSetTopEvents = useRef(false);

// 1. if no eventNames and no featureIds, use topEventsLoading

// useEffect(() => {
//   if (topEvents && !topEventsLoading) {
//     console.log("Setting top events:", topEvents);
//   }
// }, [topEventsLoading]);

// useEffect(() => {
//   if (
//     topEvents &&
//     !topEventsLoading &&
//     nullish(eventNames) &&
//     nullish(featureIds) &&
//     !hasCleared
//   ) {
//     searchParams.set("event_names", topEvents.eventNames.join(","));
//     searchParams.set("feature_ids", topEvents.featureIds.join(","));
//     // hasSetTopEvents.current = true;

//     navigate(`?${searchParams.toString()}`);
//   }
// }, [
//   topEventsLoading,
//   eventNames,
//   featureIds,
//   hasCleared,
//   topEvents,
//   searchParams,
//   navigate,
// ]);
