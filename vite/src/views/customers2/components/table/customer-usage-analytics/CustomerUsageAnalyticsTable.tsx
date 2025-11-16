import { ChartBar } from "@phosphor-icons/react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useCusEventsQuery } from "@/views/customers/customer/hooks/useCusEventsQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { useCustomerTimeseriesEvents } from "@/views/customers2/hooks/useCustomerTimeseriesEvents";
import { CustomerUsageAnalyticsChart } from "./CustomerUsageAnalyticsChart";
import { CustomerUsageAnalyticsColumns } from "./CustomerUsageAnalyticsColumns";
import { CustomerUsageAnalyticsFullButton } from "./CustomerUsageAnalyticsFullButton";
import { CustomerUsageAnalyticsSelectDays } from "./CustomerUsageAnalyticsSelectDays";

export function CustomerUsageAnalyticsTable() {
	const [selectedDays, setSelectedDays] = useQueryState(
		"analyticsTimeRange",
		parseAsInteger.withDefault(7),
	);

	const { customer } = useCusQuery();

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

	// const availableFeatures = useMemo(
	// 	() => getAvailableFeatures({ events: rawEvents ?? [] }),
	// 	[rawEvents],
	// );

	// useEffect(() => {
	// 	if (
	// 		availableFeatures.length > 0 &&
	// 		selectedFeatures &&
	// 		selectedFeatures.length === 0
	// 	) {
	// 		setSelectedFeatures(availableFeatures as string[]);
	// 	}
	// }, [availableFeatures, selectedFeatures, setSelectedFeatures]);

	// const filteredEvents = useMemo(
	// 	() =>
	// 		filterEventsByTimeAndFeatures({
	// 			events: rawEvents ?? [],
	// 			selectedDays,
	// 			selectedFeatures,
	// 		}),
	// 	[rawEvents, selectedDays, selectedFeatures],
	// );

	// Limit to 100 most recent events for the table
	// const limitedEvents = useMemo(() => rawEvents.slice(0, 100), [rawEvents]);

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
				rowClassName: "h-8 bg-white border-none",
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<ChartBar size={16} weight="fill" className="text-t5" />
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
				<div className="flex overflow-hidden w-full gap-2 ">
					{isLoading ? (
						<div className="flex justify-center py-4 w-full h-full relative overflow-visible text-sm">
							<div className="text-sm text-t4 text-center overflow-visible flex flex-col gap-2 shimmer">
								<span>Loading usage events</span>
							</div>
							{/* <div className="font-mono text-t6 absolute top-8.5">
								{customer.name || customer.email || customer.id}
							</div> */}
						</div>
					) : hasEvents ? (
						<>
							<div className="flex max-w-3/8 w-full min-w-0 flex-col h-[250px]">
								<div className="overflow-hidden flex flex-col border border-border-table bg-stone-100">
									<div className="overflow-x-auto">
										<table className="table-fixed p-0 w-full">
											<Table.Header />
										</table>
									</div>
									<div className="overflow-auto flex-1">
										<table className="table-fixed p-0 w-full">
											<Table.Body />
										</table>
									</div>
								</div>
							</div>
							<div className="flex max-w-5/8 w-full min-w-0 h-[250px]">
								<CustomerUsageAnalyticsChart
									timeseriesEvents={timeseriesEvents}
									// events={filteredEvents}
									daysToShow={selectedDays ?? 7}
								/>
							</div>
						</>
					) : (
						<div className="flex justify-center items-center py-4 w-full h-full">
							<p className="text-sm text-t4">
								Events will display here when tracked
							</p>
						</div>
					)}
				</div>
			</Table.Container>
		</Table.Provider>
	);
}
