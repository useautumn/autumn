import { AppEnv, type Event } from "@autumn/shared";
import { ArrowSquareOutIcon, ChartBarIcon } from "@phosphor-icons/react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
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
	const env = useEnv();
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

	// Extract unique event names from raw events for the chart query
	const customerEventNames = useMemo(() => {
		if (!rawEvents?.length) return [];
		return [...new Set(rawEvents.map((e: Event) => e.event_name))].slice(0, 5);
	}, [rawEvents]);

	// Fetch pre-aggregated timeseries data for the chart
	const { timeseriesEvents, isLoading: timeseriesLoading } =
		useCustomerTimeseriesEvents({
			interval,
			eventNames: customerEventNames,
		});

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
		storageKey: "customer-usage-analytics",
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
							<EmptyState text={<LoadingShimmerText text="Loading events" />} />
						) : hasEvents ? (
							<>
								<Table.Content
									className={cn(
										"rounded-lg bg-card w-full max-w-1/2 h-[250px]",
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
							<EmptyState
								text={
									<>
										Track an event to display feature usage
										{env === AppEnv.Sandbox && (
											<IconButton
												variant="muted"
												size="sm"
												iconOrientation="right"
												icon={
													<ArrowSquareOutIcon
														size={16}
														className="-translate-y-px"
													/>
												}
												className="px-1! ml-2"
												onClick={() =>
													window.open(
														"https://docs.useautumn.com/documentation/getting-started/gating",
														"_blank",
													)
												}
											>
												Docs
											</IconButton>
										)}
									</>
								}
							/>
						)}
					</div>
				</Table.Container>
			</Table.Provider>
		</>
	);
}
