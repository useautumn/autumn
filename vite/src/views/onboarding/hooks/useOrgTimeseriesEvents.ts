import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { TimeseriesData } from "@/views/customers2/components/table/customer-usage-analytics/customerUsageAnalyticsUtils";

const userTimezone = (): string => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return "UTC";
	}
};

/**
 * Org-wide event timeseries for the chart. Unlike the customer hook, this omits
 * `customer_id` entirely — the endpoint treats a missing id as "aggregate all",
 * but rejects an explicit null.
 */
export const useOrgTimeseriesEvents = ({
	eventNames,
	interval = "7d",
	enabled = true,
}: {
	eventNames: string[];
	interval?: "24h" | "7d" | "30d" | "90d";
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const timezone = userTimezone();

	const { data, isLoading } = useQuery<{
		events?: TimeseriesData;
		totals?: Record<string, { count: number; sum: number }>;
	}>({
		queryKey: buildKey([
			"onboarding-timeseries",
			interval,
			timezone,
			...[...eventNames].sort(),
		]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/events", {
				interval,
				event_names: eventNames,
				timezone,
			});
			return data;
		},
		enabled: enabled && eventNames.length > 0,
	});

	return {
		timeseriesEvents: data?.events,
		totals: data?.totals,
		isLoading,
	};
};
