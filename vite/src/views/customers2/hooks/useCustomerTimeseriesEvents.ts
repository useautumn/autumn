import { ErrCode } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
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
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { customer_id } = useParams();
	const customerIdToUse = providedCustomerId ?? customer_id;

	const timezone = useMemo(() => getUserTimezone(), []);

	const { eventNames: cachedEventNames } = useEventNames();
	const eventNames = providedEventNames?.length
		? providedEventNames
		: cachedEventNames.slice(0, 3).map((e) => e.event_name);

	const postBody = {
		customer_id: customerIdToUse || null,
		interval,
		event_names: eventNames,
		timezone,
	};

	const { data, isLoading, error } = useQuery({
		queryKey: buildKey([
			"customer-timeseries-events",
			customerIdToUse,
			interval,
			timezone,
			...eventNames.sort(),
		]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/events", postBody);
			return data;
		},
		enabled,
	});

	return {
		timeseriesEvents: data?.events,
		isLoading,
		error: error && (error as any)?.code === ErrCode.ClickHouseDisabled
			? null
			: error,
	};
};
