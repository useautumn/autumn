import { ErrCode } from "@autumn/shared";
import { ChartBarIcon, DatabaseIcon } from "@phosphor-icons/react";
import type { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useEnv } from "@/utils/envUtils";
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
	const [pageSize, setPageSize] = useState(500);
	const [currentPage, setCurrentPage] = useState(0);
	const [totalPages, setTotalPages] = useState(0);
	const [totalRows, setTotalRows] = useState(0);
	const [groupFilter, setGroupFilter] = useState<string | null>(null);
	const gridRef = useRef<AgGridReact>(null);
	const navigate = useNavigate();

	const env = useEnv();
	const { flags, isLoading: isFeatureFlagsLoading } = useFeatureFlags();

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
		entityNames,
		customerNames,
		totals,
		eventNames: responseEventNames,
	} = useAnalyticsData({ hasCleared });

	// Build internal_product_id → display name from the products cache so the
	// chart can label plan_id groups (backend ships raw internal ids).
	// `/products/products` only returns the latest version per public id, so
	// historical versions (e.g. a customer still on v1 after we ship v2) get
	// merged in from `customer.customer_products`. When the same public id has
	// multiple versions in scope, suffix with ` v{version}`.
	const { products } = useProductsQuery({ allVersions: true });
	const planNames = useMemo(() => {
		type Entry = {
			internal_id: string;
			id: string;
			name: string;
			version: number;
		};
		const entries: Entry[] = [];
		const seen = new Set<string>();
		const push = (e: Partial<Entry> & { internal_id?: string | null }) => {
			if (!e.internal_id || seen.has(e.internal_id)) return;
			seen.add(e.internal_id);
			entries.push({
				internal_id: e.internal_id,
				id: e.id ?? e.internal_id,
				name: e.name ?? e.id ?? e.internal_id,
				version: e.version ?? 1,
			});
		};

		for (const p of products) push(p);
		for (const cp of customer?.customer_products ?? []) {
			push({
				internal_id: cp.product?.internal_id,
				id: cp.product?.id,
				name: cp.product?.name,
				version: cp.product?.version,
			});
		}

		// Count public id occurrences so we only suffix when there's ambiguity.
		const idCount = new Map<string, number>();
		for (const e of entries) {
			idCount.set(e.id, (idCount.get(e.id) ?? 0) + 1);
		}

		const map: Record<string, string> = {};
		for (const e of entries) {
			const showVersion = (idCount.get(e.id) ?? 0) >= 2;
			map[e.internal_id] = showVersion ? `${e.name} v${e.version}` : e.name;
		}
		return map;
	}, [products, customer]);

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

		// Apply frontend filter if a group filter is selected
		let filteredEvents = events;
		if (groupBy && groupFilter) {
			// Handle special case for column-based operators (not a property)
			const groupByColumn =
				groupBy === "customer_id" ||
				groupBy === "entity_id" ||
				groupBy === "plan_id"
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

		// Generate chart config with different colors per group
		const config = generateChartConfig({
				events: transformed,
				features,
				groupBy,
				originalColors: colors,
				entityNames,
				customerNames,
				planNames,
			});

		return { chartData: transformed, chartConfig: config };
	}, [events, features, groupBy, groupFilter, entityNames, customerNames, planNames]);

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

	if (clickHouseDisabled) {
		return (
			<div className="flex flex-col items-center justify-center h-full">
				<h3 className="text-sm text-t2 font-bold">Tinybird is disabled</h3>
			</div>
		);
	}

	const showRevenueMetrics =
		env === "live" &&
		!isFeatureFlagsLoading &&
		!flags.maintenanceModes.analytics.disableRevenueMetrics;

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
				entityNames,
				customerNames,
				planNames,
			}}
		>
			<div className="flex flex-col gap-4 h-full relative w-full text-sm pb-8 max-w-5xl mx-auto px-4 sm:px-10 pt-4 sm:pt-8">
				<OnboardingGuide />
				{showRevenueMetrics && <RevenueMetricsSection />}
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
							<div className="h-full flex flex-col overflow-hidden bg-interactive-secondary border rounded-lg max-h-[350px]">
								{(() => {
									// Build legend entries:
									// - Ungrouped: one entry per event name with its total.
									// - Grouped: one entry per chart series (feature × group),
									//   summed over chartData rows for accurate per-series totals.
									type LegendEntry = {
										key: string;
										label: string;
										color: string | undefined;
										value: number;
										title: string;
									};
									let legend: LegendEntry[] = [];
									if (groupBy && chartConfig) {
										legend = chartConfig.map((s) => {
											const sum = chartData.data.reduce(
												(acc, row) =>
													acc +
													Number(
														(row as Record<string, string | number>)[s.yKey] ??
															0,
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
										legend = responseEventNames.map((name) => {
											const entry = totals?.[name] ?? { count: 0, sum: 0 };
											const primary =
												entry.sum !== entry.count ? entry.sum : entry.count;
											const series = chartConfig?.find(
												(c) =>
													c.yKey === `${name}_count` || c.yKey === name,
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
									legend = legend.filter((e) => e.value > 0);
									if (legend.length === 0) return null;
									// Always show labels when grouping — the label IS the point;
									// for ungrouped, hide labels when there's too many to fit.
									const showLabel = !!groupBy || legend.length <= 3;
									return (
										<div className="flex items-stretch h-7 gap-4 px-2 overflow-x-auto overflow-y-hidden border-b shrink-0 bg-card">
											{legend.map((e) => (
												<div
													key={e.key}
													className="flex items-center gap-1.5 min-w-0"
													title={e.title}
												>
													<span
														className="w-2 h-2 rounded-sm shrink-0"
														style={{ background: e.color }}
													/>
													{showLabel && (
														<span className="text-t4 text-tiny truncate min-w-0">
															{e.label}
														</span>
													)}
													<span className="text-t2 text-tiny tabular-nums shrink-0">
														{e.value.toLocaleString()}
													</span>
												</div>
											))}
										</div>
									);
								})()}
								<div className="flex-1 min-h-0">
									<EventsBarChart
										data={
											chartData as Parameters<typeof EventsBarChart>[0]["data"]
										}
										chartConfig={chartConfig}
									/>
								</div>
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
						<div className="w-full h-[calc(100%-2.5rem)]">
							<EventsAGGrid data={rawEvents} />
						</div>
					)}
				</div>
			</div>
		</AnalyticsContext.Provider>
	);
};
