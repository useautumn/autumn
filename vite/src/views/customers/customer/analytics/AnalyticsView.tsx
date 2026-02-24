import { ErrCode } from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	ChartBarIcon,
	DatabaseIcon,
} from "@phosphor-icons/react";
import type { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { OnboardingGuide } from "@/views/onboarding4/OnboardingGuide";
import { AnalyticsContext } from "./AnalyticsContext";
import { EventsAGGrid, EventsBarChart } from "./AnalyticsGraph";
import { colors } from "./components/AGGrid";
import PaginationPanel from "./components/PaginationPanel";
import { QueryTopbar } from "./components/QueryTopbar";
import {
	useAnalyticsData,
	useRawAnalyticsData,
} from "./hooks/useAnalyticsData";
import { extractPropertyKeys } from "./utils/extractPropertyKeys";
import {
	generateChartConfig,
	transformGroupedData,
} from "./utils/transformGroupedChartData";

export const AnalyticsView = () => {
	const [searchParams] = useSearchParams();
	const [eventNames, setEventNames] = useState<string[]>([]);
	const [featureIds, setFeatureIds] = useState<string[]>([]);
	const [clickHouseDisabled, setClickHouseDisabled] = useState(false);
	const [hasCleared, setHasCleared] = useState(false);
	const [pageSize, setPageSize] = useState(500);
	const [currentPage, setCurrentPage] = useState(0);
	const [totalPages, setTotalPages] = useState(0);
	const [totalRows, setTotalRows] = useState(0);
	const [groupFilter, setGroupFilter] = useState<string | null>(null);
	const gridRef = useRef<AgGridReact>(null);
	const navigate = useNavigate();

	const customerId = searchParams.get("customer_id");

	const {
		customer,
		features,
		events,
		queryLoading,
		error,
		bcExclusionFlag,
		groupBy,
		truncated,
	} = useAnalyticsData({ hasCleared });

	// Show toast when data is truncated due to too many unique group values
	const hasShownTruncationToast = useRef(false);
	useEffect(() => {
		if (truncated && groupBy && !hasShownTruncationToast.current) {
			toast.error(
				`Too many unique values for '${groupBy}'. Showing top 10 by volume.`,
			);
			hasShownTruncationToast.current = true;
		}
		if (!truncated || !groupBy) {
			hasShownTruncationToast.current = false;
		}
	}, [truncated, groupBy]);

	// Clear the filter when groupBy changes
	useEffect(() => {
		setGroupFilter(null);
	}, [groupBy]);

	// Extract unique group values from events data for filtering
	const availableGroupValues = useMemo(() => {
		if (!groupBy || !events?.data) {
			return [];
		}

		// Handle special case for customer_id (not a property)
		const groupByColumn =
			groupBy === "customer_id" ? "customer_id" : `properties.${groupBy}`;
		const uniqueValues = new Set<string>();

		for (const row of events.data) {
			const value = row[groupByColumn];
			if (value !== undefined && value !== null && value !== "") {
				uniqueValues.add(String(value));
			}
		}

		return Array.from(uniqueValues).sort();
	}, [groupBy, events?.data]);

	const { rawEvents, queryLoading: rawQueryLoading } = useRawAnalyticsData();

	// Extract property keys from raw events for the group by dropdown
	const propertyKeys = useMemo(() => {
		return extractPropertyKeys({ rawEvents: rawEvents?.data });
	}, [rawEvents?.data]);

	// Transform and configure chart data
	const { chartData, chartConfig } = useMemo(() => {
		if (!events) {
			return { chartData: null, chartConfig: null };
		}

		// Apply frontend filter if a group filter is selected
		let filteredEvents = events;
		if (groupBy && groupFilter) {
			// Handle special case for customer_id (not a property)
			const groupByColumn =
				groupBy === "customer_id" ? "customer_id" : `properties.${groupBy}`;
			const filteredData = events.data.filter(
				(row: Record<string, string | number>) =>
					String(row[groupByColumn]) === groupFilter,
			);
			filteredEvents = {
				...events,
				data: filteredData,
				rows: filteredData.length,
			};
		}

		// Transform data for grouped display (pivots rows into columns per group)
		const transformed = transformGroupedData({
			events: filteredEvents,
			groupBy,
		});

		// Generate chart config with different colors per group
		const config = generateChartConfig({
			events: transformed,
			features,
			groupBy,
			originalColors: colors,
		});

		return { chartData: transformed, chartConfig: config };
	}, [events, features, groupBy, groupFilter]);

	useEffect(() => {
		if (error?.response?.data?.code === ErrCode.ClickHouseDisabled) {
			setClickHouseDisabled(true);
		}
	}, [error]);

	if (clickHouseDisabled) {
		return (
			<div className="flex flex-col items-center justify-center h-full">
				<h3 className="text-sm text-t2 font-bold">ClickHouse is disabled</h3>
			</div>
		);
	}

	// Show empty state if no actual analytics events (check rawEvents and totalRows)
	const hasNoData =
		!rawQueryLoading &&
		(!rawEvents || !rawEvents.data || rawEvents.data.length === 0) &&
		totalRows === 0;

	if (hasNoData) {
		return (
			<EmptyState
				type="analytics"
				actionButton={
					<IconButton
						variant="secondary"
						iconOrientation="right"
						icon={<ArrowSquareOutIcon size={16} />}
						onClick={() => {
							window.open(
								"https://docs.useautumn.com/documentation/getting-started/gating",
								"_blank",
							);
						}}
					>
						Docs
					</IconButton>
				}
			/>
		);
	}

	return (
		<AnalyticsContext.Provider
			value={{
				customer,
				eventNames,
				selectedInterval: searchParams.get("interval") || "30d",
				setSelectedInterval: (interval: string) => {
					const newParams = new URLSearchParams(searchParams);
					newParams.set("interval", interval);
					navigate(`${location.pathname}?${newParams.toString()}`);
				},
				selectedBinSize: searchParams.get("bin_size") || "day",
				setSelectedBinSize: (binSize: string) => {
					const newParams = new URLSearchParams(searchParams);
					newParams.set("bin_size", binSize);
					navigate(`${location.pathname}?${newParams.toString()}`);
				},

				setEventNames,
				featureIds,
				setFeatureIds,
				features,
				bcExclusionFlag,
				hasCleared,
				setHasCleared,
				gridRef,
				pageSize,
				setPageSize,
				currentPage,
				setCurrentPage,
				totalPages,
				setTotalPages,
				totalRows,
				setTotalRows,
				propertyKeys,
				groupFilter,
				setGroupFilter,
				availableGroupValues,
			}}
		>
			<div className="flex flex-col gap-4 h-full relative w-full text-sm pb-8 max-w-5xl mx-auto px-4 sm:px-10 pt-4 sm:pt-8">
				<OnboardingGuide />
				<div className="max-h-[400px] min-h-[400px] pb-6 shrink-0">
					<div className="flex justify-between pb-4 h-10">
						<div className="text-t3 text-md flex gap-2 items-center">
							<ChartBarIcon size={16} weight="fill" className="text-subtle" />
							Usage
						</div>
						<QueryTopbar />
					</div>
					{queryLoading && (
						<div className="flex-1">
							<p className="text-t3 text-sm shimmer w-fit">
								Loading chart {customerId ? `for ${customerId}` : ""}
							</p>
						</div>
					)}

					<div className="h-full overflow-hidden">
						{chartData && chartData.data.length > 0 && (
							<div className="h-full overflow-hidden bg-interactive-secondary border max-h-[350px]">
								<EventsBarChart
									data={
										chartData as Parameters<typeof EventsBarChart>[0]["data"]
									}
									chartConfig={chartConfig}
								/>
							</div>
						)}

						{!chartData && !queryLoading && (
							<div className="flex-1 px-10 pt-6">
								<p className="text-t3 text-sm">
									No events found. Please widen your filters.{" "}
									{eventNames.length === 0
										? "Try to select some events in the dropdown above."
										: ""}
								</p>
							</div>
						)}
					</div>
				</div>

				<div className="flex-1 min-h-[400px] pb-8">
					<div className="flex justify-between pb-4 h-10">
						<div className="text-t3 text-md flex gap-2 items-center">
							<DatabaseIcon size={16} weight="fill" className="text-subtle" />
							Events
						</div>
						{/* event count  */}
						<div className="flex items-center gap-2">
							<span className="text-sm text-t3">
								Showing {totalRows} events
							</span>
							<PaginationPanel />
						</div>
					</div>

					{rawQueryLoading && (
						<div className="flex-1">
							<p className="text-t3 text-sm shimmer w-fit">
								Loading events {customerId ? `for ${customerId}` : ""}
							</p>
						</div>
					)}

					{rawEvents && !rawQueryLoading && (
						<Card className="w-full h-[calc(100%-2.5rem)] border-none rounded-none shadow-none py-0">
							<CardContent className="p-0 h-full bg-transparent overflow-hidden">
								<EventsAGGrid data={rawEvents} />
							</CardContent>
						</Card>
					)}
				</div>
			</div>
		</AnalyticsContext.Provider>
	);
};
