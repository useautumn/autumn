import { ChartBar } from "@phosphor-icons/react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";
import { useCusEventsQuery } from "@/views/customers/customer/hooks/useCusEventsQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { useCustomerTimeseriesEvents } from "@/views/customers2/hooks/useCustomerTimeseriesEvents";
import { EmptyState } from "../EmptyState";
import { CustomerUsageAnalyticsChart } from "./CustomerUsageAnalyticsChart";
import { CustomerUsageAnalyticsColumns } from "./CustomerUsageAnalyticsColumns";
import { CustomerUsageAnalyticsFullButton } from "./CustomerUsageAnalyticsFullButton";
import { CustomerUsageAnalyticsSelectDays } from "./CustomerUsageAnalyticsSelectDays";

export function CustomerUsageAnalyticsTable() {
	const [selectedDays, setSelectedDays] = useQueryState(
		"analyticsTimeRange",
		parseAsInteger.withDefault(7),
	);

	// Map selectedDays to interval for API
	const interval = useMemo(() => {
		if (selectedDays <= 7) return "7d";
		return "30d";
	}, [selectedDays]);

	// const [selectedFeatures, setSelectedFeatures] = useQueryState(
	// 	"analyticsFeatures",
	// 	parseAsArrayOf(parseAsString).withDefault([]),
	// );

	// Fetch raw events for the table via clickhouse
	// const { rawEvents, isLoading: rawEventsLoading } = useCustomerRawEvents({
	// 	interval,
	// });

	// Fetch raw events for the table via API
	const { events: rawEvents, isLoading: rawEventsLoading } =
		useCusEventsQuery();

	// Fetch pre-aggregated timeseries data for the chart
	const { timeseriesEvents, isLoading: timeseriesLoading } =
		useCustomerTimeseriesEvents({
			interval,
			// eventNames: selectedFeatures || [],
		});

	const isLoading = rawEventsLoading || timeseriesLoading;

	const enableSorting = false;
	const table = useCustomerTable({
		data: rawEvents,
		columns: CustomerUsageAnalyticsColumns,
	});

	const hasEvents = rawEvents?.length > 0;

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: CustomerUsageAnalyticsColumns.length,
				enableSorting,
				isLoading,
				rowClassName: "h-8 bg-interactive-secondary dark:bg-card",
				flexibleTableColumns: true,
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<ChartBar size={16} weight="fill" className="text-subtle" />
						Usage
					</Table.Heading>
					<Table.Actions>
						{/* <CustomerUsageAnalyticsSelectFeatures
							availableFeatures={availableFeatures as string[]}
							selectedFeatures={selectedFeatures}
							setSelectedFeatures={setSelectedFeatures}
						/> */}
						<CustomerUsageAnalyticsSelectDays
							selectedDays={selectedDays}
							setSelectedDays={setSelectedDays}
						/>
						<CustomerUsageAnalyticsFullButton />
					</Table.Actions>
				</Table.Toolbar>
				<div className="flex w-full gap-2 ">
					{isLoading ? (
						<div className="flex justify-center py-4 w-full h-full relative overflow-visible text-sm bg-interactive-secondary rounded-lg border shadow-sm">
							<LoadingShimmerText text="Loading events" />
							{/* <div className="font-mono text-t6 absolute top-8.5">
								{customer.name || customer.email || customer.id}
							</div> */}
						</div>
					) : hasEvents ? (
						<>
							<div className="flex max-w-1/2 w-full min-w-0 flex-col h-[250px]">
								<div className="overflow-hidden flex flex-col border h-full bg-card rounded-lg">
									<Table.Content className="border-none overflow-auto">
										<Table.Header />
										<Table.Body />
									</Table.Content>
								</div>
							</div>
							<div className="flex max-w-1/2 w-full min-w-0 h-[250px]">
								<CustomerUsageAnalyticsChart
									timeseriesEvents={timeseriesEvents}
									// events={filteredEvents}
									daysToShow={selectedDays ?? 7}
								/>
							</div>
						</>
					) : (
						<EmptyState text="Record events to display feature usage" />
					)}
				</div>
			</Table.Container>
		</Table.Provider>
	);
}
