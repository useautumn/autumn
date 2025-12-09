import type { Event } from "@autumn/shared";
import { ChartBarIcon } from "@phosphor-icons/react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { cn } from "@/lib/utils";
import { useCusEventsQuery } from "@/views/customers/customer/hooks/useCusEventsQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { useCustomerTimeseriesEvents } from "@/views/customers2/hooks/useCustomerTimeseriesEvents";
import { EmptyState } from "../EmptyState";
import { CustomerUsageAnalyticsChart } from "./CustomerUsageAnalyticsChart";
import {
	BASE_COLUMN_IDS,
	CustomerUsageAnalyticsColumns,
	generatePropertyColumns,
} from "./CustomerUsageAnalyticsColumns";
import { CustomerUsageAnalyticsFullButton } from "./CustomerUsageAnalyticsFullButton";
import { CustomerUsageAnalyticsSelectDays } from "./CustomerUsageAnalyticsSelectDays";
import { EventDetailsDialog } from "./EventDetailsDialog";

export function CustomerUsageAnalyticsTable() {
	const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
	const [eventDialogOpen, setEventDialogOpen] = useState(false);

	const [selectedDays, setSelectedDays] = useQueryState(
		"analyticsTimeRange",
		parseAsInteger.withDefault(7),
	);

	// Map selectedDays to interval for API
	const interval = useMemo(() => {
		if (selectedDays <= 7) return "7d";
		return "30d";
	}, [selectedDays]);

	// Fetch raw events for the table via API
	const { events: rawEvents, isLoading: rawEventsLoading } =
		useCusEventsQuery();

	// Fetch pre-aggregated timeseries data for the chart
	const { timeseriesEvents, isLoading: timeseriesLoading } =
		useCustomerTimeseriesEvents({ interval });

	const isLoading = rawEventsLoading || timeseriesLoading;

	// Generate dynamic columns from event properties
	const columns = useMemo(() => {
		const propertyColumns = generatePropertyColumns({
			events: rawEvents ?? [],
		});
		return [...CustomerUsageAnalyticsColumns, ...propertyColumns];
	}, [rawEvents]);

	// Manage column visibility with base columns visible by default
	const { columnVisibility, setColumnVisibility } = useColumnVisibility({
		columns,
		defaultVisibleColumnIds: BASE_COLUMN_IDS,
	});

	const table = useCustomerTable({
		data: rawEvents ?? [],
		columns,
		options: {
			state: { columnVisibility },
			onColumnVisibilityChange: setColumnVisibility,
		},
	});

	const handleRowClick = (event: Event) => {
		setSelectedEvent(event);
		setEventDialogOpen(true);
	};

	const hasEvents = rawEvents?.length > 0;

	return (
		<>
			<EventDetailsDialog
				event={selectedEvent}
				open={eventDialogOpen}
				setOpen={setEventDialogOpen}
			/>
			<Table.Provider
				config={{
					table,
					numberOfColumns: columns.length,
					enableSorting: false,
					isLoading,
					onRowClick: handleRowClick,
					rowClassName:
						"h-8 bg-interactive-secondary dark:bg-card border-b cursor-pointer hover:bg-interactive-secondary-hover",
					flexibleTableColumns: true,
					enableColumnVisibility: true,
					columnVisibilityStorageKey: "customer-usage-analytics",
				}}
			>
				<Table.Container>
					<Table.Toolbar>
						<Table.Heading>
							<ChartBarIcon size={16} weight="fill" className="text-subtle" />
							Usage
						</Table.Heading>
						<Table.Actions>
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
							</div>
						) : hasEvents ? (
							<>
								<Table.Content
									className={cn(
										"rounded-lg bg-card w-full !max-w-1/2 h-[250px]",
									)}
								>
									<Table.Header />
									<Table.Body />
								</Table.Content>

								<div className="flex max-w-1/2 w-full min-w-0 h-[250px]">
									<CustomerUsageAnalyticsChart
										timeseriesEvents={timeseriesEvents}
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
		</>
	);
}
