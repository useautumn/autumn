import { ErrCode } from "@autumn/shared";
import { useMemo } from "react";
import { useParams } from "react-router";
import { usePostSWR } from "@/services/useAxiosSwr";
import { useEventNames } from "@/views/customers/customer/analytics/hooks/useEventNames";

/** Gets the user's IANA timezone (e.g., "America/New_York") */
const getUserTimezone = (): string => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return "UTC";
	}
};

export const useCustomerTimeseriesEvents = ({
	interval = "30d",
	eventNames: providedEventNames,
	enabled = true,
	customerId: providedCustomerId,
}: {
	interval?: "24h" | "7d" | "30d" | "90d";
	eventNames?: string[];
	/** Prevent the timeseries fetch from firing until prerequisites are ready */
	enabled?: boolean;
	/** External customer ID override. Falls back to the `customer_id` URL param. */
	customerId?: string;
}) => {
	const { customer_id } = useParams();
	const customer_id_to_use = providedCustomerId ?? customer_id;

	// Get user's timezone - memoized since it won't change during session
	const timezone = useMemo(() => getUserTimezone(), []);

	// Use cached event names if none provided
	const { eventNames: cachedEventNames } = useEventNames();
	const eventNames = providedEventNames?.length
		? providedEventNames
		: cachedEventNames.slice(0, 3).map((e) => e.event_name);

	const { data, isLoading, error } = usePostSWR({
		url: `/query/events`,
		enabled,
		data: {
			customer_id: customer_id_to_use || null,
			interval,
			event_names: eventNames,
			timezone,
		},
		queryKey: [
			"customer-timeseries-events",
			customer_id_to_use,
			interval,
			timezone,
			...eventNames.sort(),
		],
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
		timeseriesEvents: data?.events,
		isLoading,
		error: error?.code === ErrCode.ClickHouseDisabled ? null : error,
	};
};
