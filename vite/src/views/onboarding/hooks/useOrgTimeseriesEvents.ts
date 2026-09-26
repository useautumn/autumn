import { useEventsTimeseries } from "@/views/customers/customer/analytics/hooks/useEventsTimeseries";

/** Org-wide event timeseries for the chart: no customer filter. */
export const useOrgTimeseriesEvents = ({
	eventNames,
	interval = "7d",
	enabled = true,
}: {
	eventNames: string[];
	interval?: "24h" | "7d" | "30d" | "90d";
	enabled?: boolean;
}) => {
	const { timeseriesEvents, totals, isLoading } = useEventsTimeseries({
		interval,
		eventNames,
		enabled,
	});

	return { timeseriesEvents, totals, isLoading };
};
