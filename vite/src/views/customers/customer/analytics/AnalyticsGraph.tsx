import { type ChartConfig, ChartContainer } from "@autumn/ui";
import { X } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import type { Row } from "./components/analytics-types";
import { TooltipItem, tooltipItemHref } from "./components/TooltipItem";
import { useAnalyticsQueryState } from "./hooks/useAnalyticsQueryState";
import { usePinnedChartTooltip } from "./hooks/usePinnedChartTooltip";
import {
	barLayout,
	CHART_MARGIN,
	type PlotInsets,
	Y_AXIS_WIDTH,
} from "./utils/chartGeometry";
import { formatCompactNumber, formatPeriodLabel } from "./utils/parseTimestamp";
import type { ChartSeriesConfig } from "./utils/transformGroupedChartData";

const MAX_TOOLTIP_ITEMS = 5;
const TOP_RADIUS: [number, number, number, number] = [3, 3, 0, 0];
const CHART_STYLE = { cursor: "default" } as const;
const BAR_STYLE = { cursor: "pointer" } as const;
const X_TICK = { fontSize: 11, fill: "#666" } as const;
const Y_TICK = {
	fontSize: 11,
	fill: "#666",
	textAnchor: "middle" as const,
	dx: -15,
	dy: -3,
} as const;

export const EventsBarChart = memo(function EventsBarChart({
	data,
	chartConfig,
	ticks,
	onGeometry,
}: {
	data: {
		meta: any[];
		rows: number;
		data: Row[];
	};
	chartConfig: ChartSeriesConfig[];
	ticks?: number[];
	onGeometry?: (insets: PlotInsets) => void;
}) {
	const { queryStates } = useAnalyticsQueryState();
	const selectedInterval = queryStates.interval;

	const {
		containerRef,
		tooltipRef,
		pinned,
		tooltipData,
		hasTooltipAnchor,
		barHandlers,
		handleBarMouseLeave,
		handleMouseMove,
		handleChartMouseLeave,
		handleChartClick,
		unpin,
	} = usePinnedChartTooltip({ data, chartConfig, onGeometry });

	const formatXAxis = useCallback(
		(value: string): string => {
			return formatPeriodLabel({ period: value, interval: selectedInterval });
		},
		[selectedInterval],
	);

	const rechartsConfig: ChartConfig = useMemo(() => {
		const config: ChartConfig = {};
		for (const series of chartConfig) {
			config[series.yKey] = { label: series.yName, color: series.fill };
		}
		return config;
	}, [chartConfig]);

	const items = tooltipData?.items ?? [];
	const visible = items.slice(0, MAX_TOOLTIP_ITEMS);
	const overflowItems = items.slice(MAX_TOOLTIP_ITEMS);
	const overflowSum = overflowItems.reduce((sum, item) => sum + item.value, 0);

	// Memoized so tooltip-driven re-renders never touch the recharts tree.
	// Recharts stacks bars in mount order, so a changed series set must remount to restack.
	const seriesSetKey = chartConfig.map((series) => series.yKey).join("|");

	const { categoryGap, segmentGap } = barLayout({
		barCount: data.data.length,
		seriesCount: chartConfig.length,
	});

	const chart = useMemo(
		() => (
			<ChartContainer
				config={rechartsConfig}
				className="h-full w-full [&_*:focus]:outline-none"
			>
				<BarChart
					key={seriesSetKey}
					data={data.data}
					margin={CHART_MARGIN}
					barCategoryGap={categoryGap}
					style={CHART_STYLE}
					throttleDelay="raf"
				>
					<CartesianGrid
						vertical={false}
						strokeDasharray="2 2"
						stroke="var(--chart-grid-stroke)"
						strokeWidth={1}
					/>
					<XAxis
						dataKey="period"
						tickLine={false}
						tickMargin={4}
						axisLine={false}
						interval="equidistantPreserveStart"
						tick={X_TICK}
						tickFormatter={formatXAxis}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={Y_AXIS_WIDTH}
						tickMargin={0}
						ticks={ticks}
						domain={ticks ? [0, ticks[ticks.length - 1]] : undefined}
						tick={Y_TICK}
						tickFormatter={formatCompactNumber}
					/>
					{chartConfig.map((series, si) => (
						<Bar
							key={series.yKey}
							dataKey={series.yKey}
							stackId="a"
							fill={series.fill}
							// Read as currentColor by the hover dim, which mixes it toward the background.
							color={series.fill}
							// A background-colored stroke reads as a gap between stacked segments.
							stroke="var(--background)"
							strokeWidth={segmentGap}
							radius={si === chartConfig.length - 1 ? TOP_RADIUS : undefined}
							activeBar={false}
							style={BAR_STYLE}
							onMouseEnter={barHandlers[si]}
							onMouseLeave={handleBarMouseLeave}
							isAnimationActive={false}
						/>
					))}
				</BarChart>
			</ChartContainer>
		),
		[
			seriesSetKey,
			categoryGap,
			segmentGap,
			data,
			rechartsConfig,
			chartConfig,
			ticks,
			formatXAxis,
			barHandlers,
			handleBarMouseLeave,
		],
	);

	return (
		<div
			ref={containerRef}
			className={cn(
				"h-full w-full relative",
				// Greyed with an opaque mix, not opacity, so the gridlines stay hidden behind the bars.
				"[&[data-segment-hover]_.recharts-bar-rectangle:not(:hover)_path]:[fill:color-mix(in_oklab,currentColor_35%,var(--background))]",
			)}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleChartMouseLeave}
			onClick={handleChartClick}
		>
			{chart}
			{/* Portaled: sticky table headers and animated card wrappers otherwise
			    win the stacking-context fight regardless of z-index. */}
			{tooltipData &&
				hasTooltipAnchor &&
				createPortal(
					<div
						ref={tooltipRef}
						className={cn(
							"fixed z-[100] bg-popover text-popover-foreground grid min-w-[8rem] items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs shadow-md ring-1 ring-foreground/10",
							!pinned && "pointer-events-none",
						)}
					>
						<div className="flex items-center gap-2">
							<span className="flex-1 font-medium">
								{formatXAxis(tooltipData.period)}
							</span>
							{pinned && (
								<button
									type="button"
									aria-label="Unpin tooltip"
									onClick={unpin}
									className="-mr-1 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
								>
									<X className="h-3 w-3" />
								</button>
							)}
						</div>
						<div className="grid gap-1">
							{visible.map((item) => (
								<TooltipItem
									key={item.dataKey}
									item={item}
									label={
										(rechartsConfig[item.dataKey]?.label as string) ??
										item.dataKey
									}
									href={pinned ? tooltipItemHref({ item }) : undefined}
								/>
							))}
							{overflowItems.length > 0 && (
								<div className="flex items-center gap-2 text-muted-foreground">
									<span className="h-2.5 w-2.5 shrink-0" />
									<span className="flex-1">+{overflowItems.length} more</span>
									<span className="tabular-nums">
										{overflowSum.toLocaleString()}
									</span>
								</div>
							)}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
});
