import { ErrCode, type Feature, FeatureType } from "@autumn/shared";
import { ChartBarIcon, DatabaseIcon } from "@phosphor-icons/react";
import type { AgGridReact } from "ag-grid-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { AnalyticsContext } from "./AnalyticsContext";
import { EventsAGGrid, EventsBarChart } from "./AnalyticsGraph";
import { colors } from "./components/AGGrid";
import PaginationPanel from "./components/PaginationPanel";
import { QueryTopbar } from "./components/QueryTopbar";
import {
	useAnalyticsData,
	useRawAnalyticsData,
} from "./hooks/useAnalyticsData";

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
		topEventsLoading,
		topEvents,
	} = useAnalyticsData({ hasCleared });

	const { rawEvents, queryLoading: rawQueryLoading } = useRawAnalyticsData();

	const chartConfig = events?.meta
		.filter((x: { name: string }) => x.name !== "period")
		.map((x: { name: string }, index: number) => {
			if (x.name !== "period") {
				const colorIndex = index % colors.length;

				return {
					xKey: "period",
					yKey: x.name,
					type: "bar",
					stacked: true,
					yName:
						features.find((feature: Feature) => {
							const eventName = x.name.replace("_count", "");

							// console.log("Feature: ", feature, eventName);

							if (feature.type === FeatureType.Boolean) return false;

							if (feature.id === eventName) {
								return true;
							}

							if (feature.event_names && feature.event_names.length > 0) {
								return feature.event_names.includes(eventName);
							}
							return false;
						})?.name || x.name.replace("_count", ""),
					fill: colors[colorIndex],
				};
			} else return null;
		});

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
		!queryLoading &&
		!rawQueryLoading &&
		!topEventsLoading &&
		(!rawEvents || !rawEvents.data || rawEvents.data.length === 0) &&
		totalRows === 0;

	if (hasNoData) {
		return <EmptyState type="analytics" />;
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
				topEvents,
			}}
		>
			<div className="flex flex-col gap-4 h-full relative w-full text-sm pb-8 max-w-5xl mx-auto px-10 pt-8">
				<div className="max-h-[400px] min-h-[400px] pb-6">
					<div className="flex justify-between pb-4 h-10">
						<div className="text-t3 text-md py-0 px-2 rounded-lg flex gap-2 items-center bg-secondary">
							<ChartBarIcon size={16} weight="fill" className="text-subtle" />
							Usage
						</div>
						<QueryTopbar />
					</div>
					{(queryLoading || topEventsLoading) && (
						<div className="flex-1">
							<p className="text-t3 text-sm shimmer w-fit">
								Loading chart {customerId ? `for ${customerId}` : ""}
							</p>
						</div>
					)}

					<div className="h-full overflow-hidden">
						{events && events.data.length > 0 && (
							<div className="h-full overflow-hidden bg-interactive-secondary border max-h-[350px]">
								<EventsBarChart data={events} chartConfig={chartConfig} />
							</div>
						)}

						{!events && !queryLoading && (
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

				<div className="h-full mb-8">
					<div className="flex justify-between pb-4 h-10">
						<div className="text-t3 text-md py-0 px-2 rounded-lg flex gap-2 items-center bg-secondary">
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
						<Card className="w-full h-full border-none rounded-none shadow-none py-0">
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
