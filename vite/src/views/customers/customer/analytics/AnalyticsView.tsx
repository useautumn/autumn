import { ErrCode } from "@autumn/shared";
import { ChartBarIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageContainer } from "@/components/general/PageContainer";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useEnv } from "@/utils/envUtils";
import { OnboardingGuide } from "@/views/onboarding4/OnboardingGuide";
import { AnalyticsContext } from "./AnalyticsContext";
import { EventsBarChart } from "./AnalyticsGraph";
import { colors } from "./components/analytics-types";
import { ChartLegend, type ChartLegendEntry } from "./components/ChartLegend";
import { EventsTable } from "./components/EventsTable";
import { QueryTopbar } from "./components/QueryTopbar";
import {
	useAnalyticsData,
	useRawAnalyticsData,
} from "./hooks/useAnalyticsData";
import { RevenueMetricsSection } from "./revenue/RevenueMetricsSection";
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
	const [groupFilter, setGroupFilter] = useState<string | null>(null);
	const [planDeselected, setPlanDeselected] = useState<Set<string>>(new Set());
	const navigate = useNavigate();

	const env = useEnv();
	const { flags, isLoading: isFeatureFlagsLoading } = useFeatureFlags();

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

		// Transform data for grouped display (pivots rows into columns per group)
		const transformed = transformGroupedData({
			events: filteredEvents,
			groupBy,
		});

		const nonEmptyData = transformed.data.filter((row) => {
			for (const key in row) {
				if (key === "period") continue;
				if (Number(row[key]) !== 0) return true;
			}
			return false;
		});
		const trimmed = { ...transformed, data: nonEmptyData, rows: nonEmptyData.length };

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
	}, [events, features, groupBy, groupFilter, planDeselected, entityNames, customerNames, planNames]);

	// Build legend entries (sorted desc, zero-values filtered). The
	// width-aware overflow logic lives in ChartLegend.
	const legendEntries: ChartLegendEntry[] = useMemo(() => {
		if (!chartData || chartData.data.length === 0) return [];
		let entries: ChartLegendEntry[] = [];
		if (groupBy && chartConfig) {
			entries = chartConfig.map((s) => {
				const sum = chartData.data.reduce(
					(acc, row) =>
						acc +
						Number(
							(row as Record<string, string | number>)[s.yKey] ?? 0,
						),
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
				const primary =
					entry.sum !== entry.count ? entry.sum : entry.count;
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
		return entries
			.filter((e) => e.value > 0)
			.sort((a, b) => b.value - a.value);
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

	const selectedInterval = searchParams.get("interval") || "30d";
	const selectedBinSize = searchParams.get("bin_size") || "day";

	const setSelectedInterval = useCallback(
		(interval: string) => {
			const newParams = new URLSearchParams(searchParams);
			newParams.set("interval", interval);
			navigate(`${location.pathname}?${newParams.toString()}`);
		},
		[searchParams, navigate],
	);

	const setSelectedBinSize = useCallback(
		(binSize: string) => {
			const newParams = new URLSearchParams(searchParams);
			newParams.set("bin_size", binSize);
			navigate(`${location.pathname}?${newParams.toString()}`);
		},
		[searchParams, navigate],
	);

	const contextValue = useMemo(
		() => ({
			customer,
			eventNames,
			selectedInterval,
			setSelectedInterval,
			selectedBinSize,
			setSelectedBinSize,
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
			selectedInterval,
			setSelectedInterval,
			selectedBinSize,
			setSelectedBinSize,
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
				<h3 className="text-sm text-muted-foreground font-bold">Tinybird is disabled</h3>
			</div>
		);
	}

	const showRevenueMetrics =
		env === "live" &&
		!isFeatureFlagsLoading &&
		!flags.maintenanceModes.analytics.disableRevenueMetrics;

	return (
		<AnalyticsContext.Provider value={contextValue}>
			<PageContainer className="text-sm">
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
					{queryLoading && (
						<div className="flex flex-col bg-interactive-secondary border rounded-lg aspect-[3/1] animate-pulse" />
					)}
					{!queryLoading && chartData && chartData.data.length > 0 && (
						<div className="flex flex-col bg-interactive-secondary border rounded-lg aspect-[3/1]">
							<ChartLegend
								entries={legendEntries}
								showLabels={!!groupBy || legendEntries.length <= 3}
							/>
							<div className="flex-1 min-h-0">
								<EventsBarChart
									data={chartData as Parameters<typeof EventsBarChart>[0]["data"]}
									chartConfig={chartConfig}
								/>
							</div>
						</div>
					)}
					{!queryLoading && (!chartData || chartData.data.length === 0) && (
						<div className="flex-1 px-10 pt-6">
							<p className="text-tertiary-foreground text-sm">
								No events found. Please widen your filters.{" "}
								{eventNames.length === 0
									? "Try to select some events in the dropdown above."
									: ""}
							</p>
						</div>
					)}
				</div>

				<div className="flex-1 min-h-[400px] pb-8">
					<EventsTable
						data={rawEvents?.data ?? []}
						isLoading={rawQueryLoading}
					/>
				</div>
			</PageContainer>
		</AnalyticsContext.Provider>
	);
};
