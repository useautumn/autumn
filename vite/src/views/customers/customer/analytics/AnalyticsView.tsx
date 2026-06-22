import { ErrCode } from "@autumn/shared";
import { PageContainer } from "@autumn/ui";
import { ChartBarIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useEnv } from "@/utils/envUtils";
import { OnboardingGuide } from "@/views/onboarding4/OnboardingGuide";
import { AnalyticsContext } from "./AnalyticsContext";
import { EventsBarChart } from "./AnalyticsGraph";
import { colors } from "./components/analytics-types";
import { ChartLegend, type ChartLegendEntry } from "./components/ChartLegend";
import { ChartSkeleton } from "./components/ChartSkeleton";
import { EventsTable } from "./components/EventsTable";
import { QueryTopbar } from "./components/QueryTopbar";
import {
	useAnalyticsData,
	useRawAnalyticsData,
} from "./hooks/useAnalyticsData";
import { RevenueMetricsSection } from "./revenue/RevenueMetricsSection";
import {
	DEFAULT_PLOT_INSETS,
	getCachedPlotInsets,
	niceCeil,
	type PlotInsets,
	plotInsetsEqual,
	setCachedPlotInsets,
} from "./utils/chartGeometry";
import { extractPropertyKeys } from "./utils/extractPropertyKeys";
import {
	generateChartConfig,
	transformGroupedData,
	trimToTopSeries,
} from "./utils/transformGroupedChartData";

export const AnalyticsView = () => {
	const [eventNames, setEventNames] = useState<string[]>([]);
	const [featureIds, setFeatureIds] = useState<string[]>([]);
	const [clickHouseDisabled, setClickHouseDisabled] = useState(false);
	const [hasCleared, setHasCleared] = useState(false);
	const [groupFilter, setGroupFilter] = useState<string | null>(null);
	const [planDeselected, setPlanDeselected] = useState<Set<string>>(new Set());

	const env = useEnv();
	const { flags, isLoading: isFeatureFlagsLoading } = useFeatureFlags();
	const reduceMotion = useReducedMotion();
	const [plotInsets, setPlotInsets] = useState<PlotInsets>(
		() => getCachedPlotInsets() ?? DEFAULT_PLOT_INSETS,
	);
	const handlePlotGeometry = useCallback((insets: PlotInsets) => {
		setCachedPlotInsets(insets);
		setPlotInsets((prev) => (plotInsetsEqual(prev, insets) ? prev : insets));
	}, []);

	const {
		customer,
		features,
		events,
		queryLoading,
		error,
		bcExclusionFlag,
		groupBy,
		truncated,
		entityNames,
		customerNames,
		planNames,
		totals,
		eventNames: responseEventNames,
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

	useEffect(() => {
		setGroupFilter(null);
		setPlanDeselected(new Set());
	}, [groupBy]);

	// Extract unique group values from events data for filtering
	const availableGroupValues = useMemo(() => {
		if (!groupBy || !events?.data) {
			return [];
		}

		// Handle special case for column-based operators (not a property)
		const groupByColumn =
			groupBy === "customer_id" ||
			groupBy === "entity_id" ||
			groupBy === "plan_id"
				? groupBy
				: `properties.${groupBy}`;
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

		let filteredEvents = events;
		if (groupBy === "plan_id" && planDeselected.size > 0) {
			const filteredData = events.data.filter(
				(row: Record<string, string | number>) =>
					!planDeselected.has(String(row.plan_id ?? "")),
			);
			filteredEvents = {
				...events,
				data: filteredData,
				rows: filteredData.length,
			};
		} else if (groupBy && groupBy !== "plan_id" && groupFilter !== null) {
			const groupByColumn =
				groupBy === "customer_id" || groupBy === "entity_id"
					? groupBy
					: `properties.${groupBy}`;
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

		// 1. Drop raw rows where every feature column is zero — cuts ~95%
		//    of rows before the pivot so it runs on hundreds, not thousands.
		const groupCol =
			groupBy === "customer_id" ||
			groupBy === "entity_id" ||
			groupBy === "plan_id"
				? groupBy
				: groupBy
					? `properties.${groupBy}`
					: null;
		const skipKeys = new Set(["period", groupCol].filter(Boolean) as string[]);
		const nonZeroData = filteredEvents.data.filter(
			(row: Record<string, string | number>) => {
				for (const key in row) {
					if (skipKeys.has(key)) continue;
					if (Number(row[key]) !== 0) return true;
				}
				return false;
			},
		);
		const nonZeroEvents =
			nonZeroData.length === filteredEvents.data.length
				? filteredEvents
				: { ...filteredEvents, data: nonZeroData, rows: nonZeroData.length };

		// 2. Pivot into one column per group×feature
		const transformed = transformGroupedData({
			events: nonZeroEvents,
			groupBy,
		});

		// 3. Keep only top 30 series by volume so Recharts renders ≤30 <Bar>s
		const trimmed = trimToTopSeries({ events: transformed, maxSeries: 30 });

		const config = generateChartConfig({
			events: trimmed,
			features,
			groupBy,
			originalColors: colors,
			entityNames,
			customerNames,
			planNames,
		});

		return { chartData: trimmed, chartConfig: config };
	}, [
		events,
		features,
		groupBy,
		groupFilter,
		planDeselected,
		entityNames,
		customerNames,
		planNames,
	]);

	const { barFractions, chartDomainMax } = useMemo(() => {
		const rows = chartData?.data;
		if (!rows || rows.length === 0 || !chartConfig) {
			return { barFractions: null, chartDomainMax: undefined };
		}
		const totals = rows.map((row) =>
			chartConfig.reduce(
				(sum, series) =>
					sum + Number((row as Record<string, unknown>)[series.yKey] ?? 0),
				0,
			),
		);
		const domainMax = niceCeil(Math.max(...totals, 1));
		return {
			barFractions: totals.map((total) => total / domainMax),
			chartDomainMax: domainMax,
		};
	}, [chartData, chartConfig]);

	// Build legend entries (sorted desc, zero-values filtered). The
	// width-aware overflow logic lives in ChartLegend.
	const legendEntries: ChartLegendEntry[] = useMemo(() => {
		if (!chartData || chartData.data.length === 0) return [];
		let entries: ChartLegendEntry[] = [];
		if (groupBy && chartConfig) {
			entries = chartConfig.map((s) => {
				const sum = chartData.data.reduce(
					(acc, row) =>
						acc + Number((row as Record<string, string | number>)[s.yKey] ?? 0),
					0,
				);
				return {
					key: s.yKey,
					label: s.yName,
					color: s.fill,
					value: sum,
					title: `${s.yName}: ${sum.toLocaleString()}`,
				};
			});
		} else {
			entries = responseEventNames.map((name) => {
				const entry = totals?.[name] ?? { count: 0, sum: 0 };
				const primary = entry.sum !== entry.count ? entry.sum : entry.count;
				const series = chartConfig?.find(
					(c) => c.yKey === `${name}_count` || c.yKey === name,
				);
				return {
					key: name,
					label: name,
					color: series?.fill,
					value: primary,
					title: `${name}: ${entry.count.toLocaleString()} events${
						entry.sum !== entry.count
							? ` · Σ ${entry.sum.toLocaleString()}`
							: ""
					}`,
				};
			});
		}
		return entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
	}, [chartData, chartConfig, groupBy, responseEventNames, totals]);

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
			groupFilter,
			setGroupFilter,
			planDeselected,
			setPlanDeselected,
			availableGroupValues,
			entityNames,
			customerNames,
			planNames,
		}),
		[
			customer,
			eventNames,
			featureIds,
			features,
			bcExclusionFlag,
			hasCleared,
			propertyKeys,
			groupFilter,
			planDeselected,
			availableGroupValues,
			entityNames,
			customerNames,
			planNames,
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

	const hasChart = !queryLoading && !!chartData && chartData.data.length > 0;
	const isEmpty = !queryLoading && !hasChart;
	const chartRevealDelay = reduceMotion ? 0 : 0.85;

	return (
		<AnalyticsContext.Provider value={contextValue}>
			<PageContainer className="text-sm h-full overflow-hidden">
				<OnboardingGuide />
				{showRevenueMetrics && <RevenueMetricsSection />}
				<div className="pb-6 shrink-0">
					<div className="flex justify-between pb-4 h-10">
						<div className="text-tertiary-foreground text-md flex gap-2 items-center">
							<ChartBarIcon size={16} weight="fill" className="text-subtle" />
							Usage
						</div>
						<QueryTopbar />
					</div>
					<div className="relative flex flex-col bg-interactive-secondary border rounded-lg aspect-[3/1] overflow-hidden">
						{(queryLoading || hasChart) && (
							<div className="absolute inset-0 flex flex-col">
								<ChartSkeleton
									targets={hasChart ? barFractions : null}
									geometry={plotInsets}
								/>
							</div>
						)}
						<AnimatePresence>
							{hasChart && (
								<motion.div
									key="chart"
									className="absolute inset-0 flex flex-col bg-interactive-secondary"
									initial={{ opacity: 0 }}
									animate={{
										opacity: 1,
										transition: {
											duration: 0.85,
											delay: chartRevealDelay,
											ease: [0.23, 1, 0.32, 1],
										},
									}}
									exit={{
										opacity: 0,
										transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
									}}
								>
									<ChartLegend
										entries={legendEntries}
										showLabels={!!groupBy || legendEntries.length <= 3}
									/>
									<div className="flex-1 min-h-0">
										<EventsBarChart
											data={
												chartData as Parameters<
													typeof EventsBarChart
												>[0]["data"]
											}
											chartConfig={chartConfig}
											domainMax={chartDomainMax}
											onGeometry={handlePlotGeometry}
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
									{eventNames.length === 0
										? "Start sending events to view usage data."
										: "No events found for these filters."}
								</p>
							</div>
						)}
					</div>
				</div>

				<div className="flex-1 min-h-[200px] pb-2">
					<EventsTable
						data={rawEvents?.data ?? []}
						isLoading={rawQueryLoading}
						emptyMessage={
							eventNames.length === 0
								? "Start sending events to view usage data."
								: "No events found for these filters."
						}
					/>
				</div>
			</PageContainer>
		</AnalyticsContext.Provider>
	);
};
