import { AppEnv, type Event } from "@autumn/shared";
import { ArrowSquareOutIcon, ChartBarIcon } from "@phosphor-icons/react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { useEnv } from "@/utils/envUtils";
import { useCusEventsQuery } from "@/views/customers/customer/hooks/useCusEventsQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
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
	const { customer } = useCustomerContext();
	const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
	const [eventDialogOpen, setEventDialogOpen] = useState(false);

	const [selectedDays, setSelectedDays] = useQueryState(
		"analyticsTimeRange",
		parseAsInteger.withDefault(7),
	);

	// Map selectedDays to interval for API
	const interval = useMemo(() => {
		if (selectedDays <= 7) return "7d" as const;
		return "30d" as const;
	}, [selectedDays]);

	// Fetch raw events for the table via API - use same interval as chart.
	// Pass the external customer ID (customer.id) since the API expects that,
	// not the internal UUID that lives in the URL param.
	const {
		events: rawEvents,
		isLoading: rawEventsLoading,
		isFetching: rawEventsFetching,
	} = useCusEventsQuery({ interval, customerId: customer.id ?? undefined });

	// Extract unique event names from raw events for the chart query
	const customerEventNames = useMemo(() => {
		if (!rawEvents?.length) return [];
		return [...new Set(rawEvents.map((e: Event) => e.event_name))].slice(0, 5);
	}, [rawEvents]);

	// Fetch pre-aggregated timeseries data for the chart — only after raw events
	// have fully settled (including background revalidations) to avoid firing with
	// stale cached event names from a previously viewed customer.
	// Pass the external customer ID since ClickHouse stores events keyed by that.
	const { timeseriesEvents, isLoading: timeseriesLoading } =
		useCustomerTimeseriesEvents({
			interval,
			eventNames: customerEventNames,
			enabled: !rawEventsFetching,
			customerId: customer.id ?? undefined,
		});

	const isLoading = rawEventsLoading || rawEventsFetching || timeseriesLoading;

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
					columnVisibilityClassName: "right-3",
					virtualization: {
						containerHeight: "250px",
						rowHeight: 32,
						overscan: 15,
					},
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
					<div className="flex flex-col lg:flex-row w-full gap-4 lg:gap-2">
						{isLoading ? (
							<EmptyState text={<LoadingShimmerText text="Loading events" />} />
						) : hasEvents ? (
							<>
								<div className="w-full lg:max-w-1/2">
									<Table.VirtualizedContent className="rounded-lg bg-card w-full max-h-[250px]">
										<Table.VirtualizedBody />
									</Table.VirtualizedContent>
								</div>

								<div className="flex lg:max-w-1/2 w-full min-w-0 h-[250px]">
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
