import type { RawEventFromClickHouse } from "@autumn/shared";
import { useMemo } from "react";
import { CustomerUsageAnalyticsChart } from "@/views/customers2/components/table/customer-usage-analytics/CustomerUsageAnalyticsChart";
import { useOrgTimeseriesEvents } from "../hooks/useOrgTimeseriesEvents";
import { PanelSection } from "./PanelSection";

const CHART_HEIGHT = 176;
/** The chart stacks a bar per event name; more than a handful is unreadable. */
const MAX_SERIES = 5;

export function EventsPanel({
	events,
	isLoading,
}: {
	events: RawEventFromClickHouse[];
	isLoading?: boolean;
}) {
	const eventNames = useMemo(
		() =>
			[...new Set(events.map((event) => event.event_name))].slice(
				0,
				MAX_SERIES,
			),
		[events],
	);

	// The same pre-aggregated series the analytics page charts, across every
	// customer — only fetched once some usage has actually landed.
	const {
		timeseriesEvents,
		totals,
		isLoading: chartLoading,
	} = useOrgTimeseriesEvents({ eventNames, interval: "7d" });

	if (events.length === 0) {
		return (
			<PanelSection
				isLoading={isLoading}
				isEmpty={!isLoading}
				loadingText="Loading events"
				emptyText="Usage you track will show up here"
			/>
		);
	}

	return (
		<div style={{ height: CHART_HEIGHT }}>
			<CustomerUsageAnalyticsChart
				timeseriesEvents={timeseriesEvents}
				totals={totals}
				daysToShow={7}
				isLoading={chartLoading}
			/>
		</div>
	);
}
