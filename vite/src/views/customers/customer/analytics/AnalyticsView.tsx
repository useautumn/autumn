import { ErrCode } from "@autumn/shared";
import { PageContainer } from "@autumn/ui";
import { ChartBarIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useEnv } from "@/utils/envUtils";
import { AnalyticsContext } from "./AnalyticsContext";
import { EventsBarChart } from "./AnalyticsGraph";
import type { EventRow, EventsData } from "./components/analytics-types";
import { ChartSkeleton } from "./components/ChartSkeleton";
import { FirstLoadNotice } from "./components/FirstLoadNotice";
import { QueryStrip } from "./components/query/QueryStrip";
import { UpdatingBar } from "./components/UpdatingBar";
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
import { type ShownChart, useLastShownChart } from "./hooks/useLastShownChart";
import { useResetQuery } from "./hooks/useResetQuery";
import { RevenueMetricsSection } from "./revenue/RevenueMetricsSection";
import {
	DEFAULT_PLOT_INSETS,
	getCachedPlotInsets,
	niceAxisTicks,
	type PlotInsets,
	plotInsetsEqual,
	predictBinStarts,
	setCachedPlotInsets,
} from "./utils/chartGeometry";
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
import { assignSeriesColors } from "./utils/seriesColors";
import {
	generateChartConfig,
	parseSeriesKey,
	transformGroupedData,
	trimToTopSeries,
} from "./utils/transformGroupedChartData";

// Quick cross-fade: a staged reveal read as the chart vanishing and popping back.
const CHART_FADE = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;
const MAX_CHART_SERIES = 30;
const STALE_OPACITY = 0.35;
// Matches the default of charting the top three events.
const PLACEHOLDER_TABLE_ROWS = 3;

/** Pivots aggregate rows into one column per group×feature, top series only. */
const toChartSeries = ({
	events,
	groupBy,
	chartGroupBy,
}: {
	events: EventsData;
	groupBy: string | null;
	chartGroupBy: string | null;
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
	return trimToTopSeries({ events: pivoted, maxSeries: MAX_CHART_SERIES });
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
	const { queryStates } = useAnalyticsQueryState();
	const { flags, isLoading: isFeatureFlagsLoading } = useFeatureFlags();
	const [plotInsets, setPlotInsets] = useState<PlotInsets>(
		() => getCachedPlotInsets() ?? DEFAULT_PLOT_INSETS,
	);
	const handlePlotGeometry = useCallback((insets: PlotInsets) => {
		setCachedPlotInsets(insets);
		setPlotInsets((prev) => (plotInsetsEqual(prev, insets) ? prev : insets));
	}, []);

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

	// Ranked before hiding groups, so hiding one never repaints the others.
	const seriesColors = useMemo(() => {
		if (!chartSource) return {};
		return assignSeriesColors({
			events: toChartSeries({ events: chartSource, groupBy, chartGroupBy }),
		});
	}, [chartSource, groupBy, chartGroupBy]);

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

	// Only an ungrouped chart has one colour per event; grouped series belong to groups.
	const eventColors = useMemo(() => {
		const colorsByEvent: Record<string, string> = {};
		if (groupBy || isDeducted || !chartConfig) return colorsByEvent;
		for (const name of responseEventNames) {
			const series = chartConfig.find(
				(c) => c.yKey === `${name}_count` || c.yKey === name,
			);
			if (series) colorsByEvent[name] = series.fill;
		}
		return colorsByEvent;
	}, [chartConfig, groupBy, isDeducted, responseEventNames]);

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

	if (clickHouseDisabled) {
		return (
			<div className="flex flex-col items-center justify-center h-full">
				<h3 className="text-sm text-muted-foreground font-bold">
					Tinybird is disabled
				</h3>
			</div>
		);
	}

	const showRevenueMetrics =
		env === "live" &&
		!isFeatureFlagsLoading &&
		!flags.maintenanceModes.analytics.disableRevenueMetrics;

	const freshChart = useMemo<ShownChart | null>(
		() =>
			!queryLoading && chartData && chartConfig && chartData.data.length > 0
				? {
						chartData,
						chartConfig,
						chartTicks,
						interval: queryStates.interval,
					}
				: null,
		[queryLoading, chartData, chartConfig, chartTicks, queryStates.interval],
	);
	const { displayedChart, isStale } = useLastShownChart({
		chart: freshChart,
		isLoading: queryLoading,
	});
	const isFirstLoad = queryLoading && !displayedChart;

	// Fixed shape so the table changes once, when names and numbers land together.
	const tablePlaceholder = useMemo<TablePlaceholder | null>(() => {
		if (!isFirstLoad) return null;
		const { interval, bin_size, start, end } = queryStates;
		return {
			rowCount: PLACEHOLDER_TABLE_ROWS,
			periodLabels: predictBinStarts({
				interval,
				binSize: bin_size,
				start,
				end,
			}).map((binStart) => formatBinStartLabel({ binStart, interval })),
		};
	}, [isFirstLoad, queryStates]);
	const isEmpty = !queryLoading && !freshChart;

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
								{isStale && <UpdatingBar />}
								<AnimatePresence initial={false}>
									{isFirstLoad && (
										<motion.div
											key="skeleton"
											className="absolute inset-0 flex flex-col"
											exit={{ opacity: 0, transition: CHART_FADE }}
										>
											<ChartSkeleton geometry={plotInsets} />
										</motion.div>
									)}
								</AnimatePresence>
								<AnimatePresence>
									{displayedChart && (
										<motion.div
											key="chart"
											className="absolute inset-0 flex flex-col"
											initial={{ opacity: 0 }}
											animate={{
												opacity: isStale ? STALE_OPACITY : 1,
												transition: CHART_FADE,
											}}
											exit={{ opacity: 0, transition: CHART_FADE }}
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
													onGeometry={handlePlotGeometry}
												/>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
								<FirstLoadNotice active={isFirstLoad} />
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

						<div className="flex-1 min-h-0 overflow-y-auto pb-2">
							<motion.div
								key={isFirstLoad ? "table-placeholder" : "table"}
								initial={{ opacity: 0 }}
								animate={{ opacity: isStale ? STALE_OPACITY : 1 }}
								transition={CHART_FADE}
								inert={isStale}
							>
								<UsageBreakdownTable
									chartData={displayedChart?.chartData ?? chartData}
									chartConfig={displayedChart?.chartConfig ?? chartConfig}
									interval={displayedChart?.interval ?? queryStates.interval}
									nameHeader={chartGroupBy ? "Series" : "Event"}
									isLoading={isFirstLoad}
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
