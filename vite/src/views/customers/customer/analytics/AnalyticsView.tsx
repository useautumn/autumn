import { ErrCode } from "@autumn/shared";
import { PageContainer } from "@autumn/ui";
import { ChartBarIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useEnv } from "@/utils/envUtils";
import { AnalyticsContext } from "./AnalyticsContext";
import { EventsBarChart } from "./AnalyticsGraph";
import type { EventRow, EventsData } from "./components/analytics-types";
import { ChartLoadingStubs } from "./components/ChartLoadingStubs";
import { QueryStrip } from "./components/query/QueryStrip";
import {
	type TablePlaceholder,
	UsageBreakdownTable,
} from "./components/UsageBreakdownTable";
import { UsagePageHeader } from "./components/UsagePageHeader";
import {
	useAnalyticsData,
	useRawAnalyticsData,
} from "./hooks/useAnalyticsData";
import { useAnalyticsQueryState } from "./hooks/useAnalyticsQueryState";
import { useFadeTransition } from "./hooks/useFadeTransition";
import { type ShownChart, useLastShownChart } from "./hooks/useLastShownChart";
import { useResetQuery } from "./hooks/useResetQuery";
import { RevenueMetricsSection } from "./revenue/RevenueMetricsSection";
import { niceAxisTicks, predictBinStarts } from "./utils/chartGeometry";
import { chartGeometryOf, chartLoadingState } from "./utils/chartLoadingState";
import { deductionsToEventsData } from "./utils/deductionsToEventsData";
import { SOURCE_FEATURE_GROUP } from "./utils/displayLabels";
import { dropZeroRowsKeepingPeriods } from "./utils/dropZeroRowsKeepingPeriods";
import { extractPropertyKeys } from "./utils/extractPropertyKeys";
import { fillMissingPeriods } from "./utils/fillMissingPeriods";
import { groupByToColumn } from "./utils/groupByColumn";
import {
	deductionGroupValues,
	hideGroupRows,
	hideGroupSeries,
} from "./utils/hideGroupValues";
import { formatBinStartLabel } from "./utils/parseTimestamp";
import { assignSeriesColors, eventColor } from "./utils/seriesColors";
import {
	dropZeroSeries,
	generateChartConfig,
	parseSeriesKey,
	transformGroupedData,
	trimToTopSeries,
} from "./utils/transformGroupedChartData";

const MAX_CHART_SERIES = 30;
// The last result stays readable behind a load that only changes the data.
const STALE_CHART_OPACITY = 0.35;
const STALE_TABLE_OPACITY = 0.5;
// Matches the default of charting the top three events.
const PLACEHOLDER_TABLE_ROWS = 3;

/** Pivots aggregate rows into one column per group×feature. */
const toChartSeries = ({
	events,
	groupBy,
	chartGroupBy,
	isDeducted,
}: {
	events: EventsData;
	groupBy: string | null;
	chartGroupBy: string | null;
	isDeducted: boolean;
}): EventsData => {
	// Dropping all-zero rows first skips ~95% of a grouped response before the pivot.
	const nonZeroEvents = dropZeroRowsKeepingPeriods({
		events,
		groupColumn: groupBy ? groupByToColumn({ groupBy }) : null,
	});
	const pivoted = transformGroupedData({
		events: nonZeroEvents,
		groupBy: chartGroupBy,
	});
	// The pipe caps groups per event, so multi-event charts still need a chart-wide cap.
	const series = isDeducted ? pivoted : dropZeroSeries({ events: pivoted });
	return trimToTopSeries({ events: series, maxSeries: MAX_CHART_SERIES });
};

export const AnalyticsView = () => {
	const [eventNames, setEventNames] = useState<string[]>([]);
	const [featureIds, setFeatureIds] = useState<string[]>([]);
	const [clickHouseDisabled, setClickHouseDisabled] = useState(false);
	const [hasCleared, setHasCleared] = useState(false);
	const [hiddenGroupValues, setHiddenGroupValues] = useState<Set<string>>(
		new Set(),
	);

	const env = useEnv();
	const resetQuery = useResetQuery();
	const fade = useFadeTransition();
	const { queryStates } = useAnalyticsQueryState();
	const { flags, isLoading: isFeatureFlagsLoading } = useFeatureFlags();

	const {
		customer,
		deductions,
		aggregateOn,
		features,
		events,
		queryLoading,
		error,
		bcExclusionFlag,
		groupBy,
		utcPeriods,
		entityNames,
		customerNames,
		planNames,
		eventNames: responseEventNames,
	} = useAnalyticsData({ hasCleared });

	const isDeducted = aggregateOn === "deducted";

	// Own-vs-borrowed only means something per entity; other groupings ignore it.
	const splitSpillover = groupBy === "entity_id";

	useEffect(() => {
		setHiddenGroupValues(new Set());
	}, [groupBy, isDeducted]);

	// The deductions pipe only emits buckets it has rows for; the events
	// aggregation beside it is already zero-filled over the same window.
	const deductionEvents = useMemo(
		() =>
			isDeducted && deductions?.length
				? fillMissingPeriods({
						events: deductionsToEventsData({
							deductions,
							utc: utcPeriods,
							splitSpillover,
						}),
						periods: (events?.data ?? []).map((row: EventRow) =>
							String(row.period),
						),
					})
				: null,
		[isDeducted, deductions, splitSpillover, events, utcPeriods],
	);

	// Extract unique group values from events data for filtering
	const availableGroupValues = useMemo(() => {
		// Deduction rows are pre-pivoted, so their groups live in the series keys.
		if (isDeducted) {
			return deductionGroupValues({ events: deductionEvents });
		}
		if (!groupBy || !events?.data) {
			return [];
		}

		const groupByColumn = groupByToColumn({ groupBy });
		// plan_id treats empty-string as a meaningful "no plan" bucket; for
		// property grouping, empty means the property is absent and we drop it.
		const allowEmpty = groupBy === "plan_id";
		const uniqueValues = new Set<string>();

		for (const row of events.data) {
			const value = row[groupByColumn];
			if (value === undefined || value === null) continue;
			if (value === "" && !allowEmpty) continue;
			uniqueValues.add(String(value));
		}

		return Array.from(uniqueValues).sort();
	}, [groupBy, events?.data, isDeducted, deductionEvents]);

	const { rawEvents } = useRawAnalyticsData();

	// Extract property keys from raw events for the group by dropdown
	const propertyKeys = useMemo(() => {
		return extractPropertyKeys({ rawEvents: rawEvents?.data });
	}, [rawEvents?.data]);

	// Deducted mode reuses the whole pipeline below: deductionsToEventsData
	// emits pre-pivoted feature__group columns, transformGroupedData no-ops
	// on them (no raw group column), and generateChartConfig parses the
	// names it already knows. Grouping defaults to the source feature — the
	// question the mode exists to answer.
	const chartGroupBy = isDeducted ? (groupBy ?? SOURCE_FEATURE_GROUP) : groupBy;
	const chartSource = isDeducted ? deductionEvents : events;

	// Coloured before hiding groups, so hiding one never repaints the others.
	const seriesColors = useMemo(() => {
		if (!chartSource) return {};
		return assignSeriesColors({
			events: toChartSeries({
				events: chartSource,
				groupBy,
				chartGroupBy,
				isDeducted,
			}),
			eventNames: responseEventNames,
		});
	}, [chartSource, groupBy, chartGroupBy, isDeducted, responseEventNames]);

	// Transform and configure chart data
	const { chartData, chartConfig } = useMemo(() => {
		if (!chartSource) {
			return { chartData: null, chartConfig: null };
		}

		const hasHiddenGroups = hiddenGroupValues.size > 0;
		let filteredEvents = chartSource;
		if (hasHiddenGroups && isDeducted) {
			filteredEvents = hideGroupSeries({
				events: chartSource,
				hiddenGroupValues,
			});
		} else if (hasHiddenGroups && groupBy) {
			filteredEvents = hideGroupRows({
				events: chartSource,
				groupBy,
				hiddenGroupValues,
			});
		}

		const trimmed = toChartSeries({
			events: filteredEvents,
			groupBy,
			chartGroupBy,
			isDeducted,
		});

		const config = generateChartConfig({
			events: trimmed,
			features,
			groupBy: chartGroupBy,
			seriesColors,
			entityNames,
			customerNames,
			planNames,
		});

		return { chartData: trimmed, chartConfig: config };
	}, [
		chartSource,
		chartGroupBy,
		isDeducted,
		features,
		groupBy,
		hiddenGroupValues,
		seriesColors,
		entityNames,
		customerNames,
		planNames,
	]);

	const chartTicks = useMemo(() => {
		const rows = chartData?.data;
		if (!rows || rows.length === 0 || !chartConfig) return undefined;
		const totals = rows.map((row) =>
			chartConfig.reduce(
				(sum, series) =>
					sum + Number((row as Record<string, unknown>)[series.yKey] ?? 0),
				0,
			),
		);
		return niceAxisTicks({ max: Math.max(...totals, 1) });
	}, [chartData, chartConfig]);

	// Each selected event's own colour, known before data lands and kept when grouping recolours its series.
	const eventColors = useMemo(
		() =>
			Object.fromEntries(
				responseEventNames.map((name: string, eventIndex: number) => [
					name,
					eventColor({ eventIndex }),
				]),
			),
		[responseEventNames],
	);

	// A group can own several series (one per event); its first colour stands for it.
	const groupColors = useMemo(() => {
		const colorsByGroup: Record<string, string> = {};
		for (const series of chartConfig ?? []) {
			const groupValue = parseSeriesKey({ name: series.yKey })?.groupValue;
			if (groupValue !== undefined && !colorsByGroup[groupValue]) {
				colorsByGroup[groupValue] = series.fill;
			}
		}
		return colorsByGroup;
	}, [chartConfig]);

	useEffect(() => {
		if (
			(
				error as {
					response?: {
						data?: {
							code?: string;
						};
					};
				}
			)?.response?.data?.code === ErrCode.TinybirdDisabled
		) {
			setClickHouseDisabled(true);
		}
	}, [error]);

	const contextValue = useMemo(
		() => ({
			customer,
			eventNames,
			setEventNames,
			featureIds,
			setFeatureIds,
			features,
			bcExclusionFlag,
			hasCleared,
			setHasCleared,
			propertyKeys,
			hiddenGroupValues,
			setHiddenGroupValues,
			availableGroupValues,
			entityNames,
			customerNames,
			planNames,
			eventColors,
			groupColors,
		}),
		[
			customer,
			eventNames,
			featureIds,
			features,
			bcExclusionFlag,
			hasCleared,
			propertyKeys,
			hiddenGroupValues,
			availableGroupValues,
			entityNames,
			customerNames,
			planNames,
			eventColors,
			groupColors,
		],
	);

	const showRevenueMetrics =
		env === "live" &&
		!isFeatureFlagsLoading &&
		!flags.maintenanceModes.analytics.disableRevenueMetrics;

	const { interval, bin_size, start, end } = queryStates;
	const geometry = chartGeometryOf({ interval, binSize: bin_size, start, end });

	const freshChart = useMemo<ShownChart | null>(
		() =>
			!queryLoading && chartData && chartConfig && chartData.data.length > 0
				? {
						chartData,
						chartConfig,
						chartTicks,
						geometry: chartGeometryOf({
							interval,
							binSize: bin_size,
							start,
							end,
						}),
					}
				: null,
		[
			queryLoading,
			chartData,
			chartConfig,
			chartTicks,
			interval,
			bin_size,
			start,
			end,
		],
	);
	const lastChart = useLastShownChart({
		chart: freshChart,
		isLoading: queryLoading,
	});
	const loadingState = queryLoading
		? chartLoadingState({
				current: geometry,
				previous: lastChart?.geometry ?? null,
			})
		: null;
	const isStale = loadingState === "dim";
	const isShowingStubs = loadingState === "stubs";
	const displayedChart = freshChart ?? (isStale ? lastChart : null);

	// The new range's bins, known before any data: stubs on the chart, columns in the table.
	const loadingBinStarts = useMemo(
		() =>
			isShowingStubs
				? predictBinStarts({ interval, binSize: bin_size, start, end })
				: null,
		[isShowingStubs, interval, bin_size, start, end],
	);
	const tablePlaceholder = useMemo<TablePlaceholder | null>(
		() =>
			loadingBinStarts && {
				rowCount: PLACEHOLDER_TABLE_ROWS,
				periodLabels: loadingBinStarts.map((binStart) =>
					formatBinStartLabel({ binStart, interval }),
				),
			},
		[loadingBinStarts, interval],
	);
	const isEmpty = !queryLoading && !freshChart;

	if (clickHouseDisabled) {
		return (
			<div className="flex flex-col items-center justify-center h-full">
				<h3 className="text-sm text-muted-foreground font-bold">
					Tinybird is disabled
				</h3>
			</div>
		);
	}

	const emptyMessage =
		eventNames.length === 0
			? "Start sending events to view usage data."
			: "No events found for these filters.";

	return (
		<AnalyticsContext.Provider value={contextValue}>
			<div className="flex h-full min-h-0">
				<PageContainer className="text-sm h-full min-w-0 overflow-hidden">
					<UsagePageHeader activeTab="overview">
						{isStale && (
							<span className="text-xs text-tertiary-foreground">
								Updating…
							</span>
						)}
						<button
							type="button"
							onClick={resetQuery}
							className="text-xs text-tertiary-foreground hover:text-foreground"
						>
							Reset filters
						</button>
					</UsagePageHeader>
					<QueryStrip propertyKeys={propertyKeys} />
					{showRevenueMetrics && <RevenueMetricsSection />}
					<div className="flex flex-col flex-1 min-h-0 min-w-0">
						<div className="pb-8 shrink-0">
							<div className="relative flex flex-col h-[300px]">
								<AnimatePresence initial={false}>
									{loadingBinStarts && (
										<ChartLoadingStubs
											key="stubs"
											binStarts={loadingBinStarts}
											interval={interval}
											seriesCount={lastChart?.chartConfig.length ?? 1}
										/>
									)}
								</AnimatePresence>
								<AnimatePresence>
									{displayedChart && (
										<motion.div
											key="chart"
											className="absolute inset-0 flex flex-col"
											initial={{ opacity: 0 }}
											animate={{
												opacity: isStale ? STALE_CHART_OPACITY : 1,
												transition: fade,
											}}
											exit={{ opacity: 0, transition: fade }}
											inert={isStale}
										>
											<div className="flex-1 min-h-0">
												<EventsBarChart
													data={
														displayedChart.chartData as Parameters<
															typeof EventsBarChart
														>[0]["data"]
													}
													chartConfig={displayedChart.chartConfig}
													ticks={displayedChart.chartTicks}
												/>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
								{isEmpty && (
									<div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
										<ChartBarIcon
											size={28}
											weight="duotone"
											className="text-muted-foreground/50"
										/>
										<p className="text-muted-foreground text-sm">
											{emptyMessage}
										</p>
									</div>
								)}
							</div>
						</div>

						<div className="flex flex-1 min-h-0 flex-col pb-2">
							<motion.div
								key={isShowingStubs ? "table-placeholder" : "table"}
								className="flex min-h-0 flex-col"
								initial={{ opacity: 0 }}
								animate={{ opacity: isStale ? STALE_TABLE_OPACITY : 1 }}
								transition={fade}
								inert={isStale}
							>
								<UsageBreakdownTable
									chartData={displayedChart?.chartData ?? chartData}
									chartConfig={displayedChart?.chartConfig ?? chartConfig}
									interval={displayedChart?.geometry.interval ?? interval}
									nameHeader={chartGroupBy ? "Series" : "Event"}
									isLoading={isShowingStubs}
									placeholder={tablePlaceholder}
								/>
							</motion.div>
						</div>
					</div>
				</PageContainer>
			</div>
		</AnalyticsContext.Provider>
	);
};
