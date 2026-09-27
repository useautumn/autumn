import { useParams } from "react-router";
import { useEventNames } from "@/views/customers/customer/analytics/hooks/useEventNames";
import { useEventsTimeseries } from "@/views/customers/customer/analytics/hooks/useEventsTimeseries";

const DEFAULT_SERIES_COUNT = 5;

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
	const customerIdToUse = providedCustomerId ?? customer_id;
	const hasProvidedEventNames = Boolean(providedEventNames?.length);

	// The customer's busiest events in the window, so the chart needn't wait on the event list.
	const { eventNames: topEventNames, isLoading: eventNamesLoading } =
		useEventNames({
			customerId: customerIdToUse,
			interval,
			limit: DEFAULT_SERIES_COUNT,
			enabled: enabled && !hasProvidedEventNames && Boolean(customerIdToUse),
		});
	const eventNames = hasProvidedEventNames
		? (providedEventNames ?? [])
		: topEventNames.map((e) => e.event_name);

	const timeseries = useEventsTimeseries({
		customerId: customerIdToUse,
		interval,
		eventNames,
		enabled,
	});

	// A window with no usage keeps the chart's empty state instead of flat zero bars.
	const hasUsage = Object.values(timeseries.totals ?? {}).some(
		({ sum }) => sum !== 0,
	);

	return {
		...timeseries,
		timeseriesEvents: hasUsage ? timeseries.timeseriesEvents : undefined,
		isLoading:
			(!hasProvidedEventNames && eventNamesLoading) || timeseries.isLoading,
	};
};
