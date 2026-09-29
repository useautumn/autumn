"use client";

import type { Event } from "@autumn/shared";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@autumn/ui";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { useIsSheetOpen } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import {
	prepareChartData,
	prepareTimeseriesChartData,
	type TimeseriesData,
} from "./customerUsageAnalyticsUtils";

export function CustomerUsageAnalyticsChart({
	timeseriesEvents,
	totals,
	events = [],
	daysToShow = 7,
	isLoading = false,
}: {
	timeseriesEvents?: TimeseriesData;
	totals?: Record<string, { count: number; sum: number }>;
	events?: Event[];
	daysToShow?: number;
	isLoading?: boolean;
}) {
	const isSheetOpen = useIsSheetOpen();

	function formatYAxisTick(value: number): string {
		// if (value === 0) return "";

		const absValue = Math.abs(value);

		if (absValue >= 1_000_000_000) {
			return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
		}
		if (absValue >= 1_000_000) {
			return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
		}
		if (absValue >= 1_000) {
			return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
		}

		return value.toString();
	}

	const { chartData, chartConfig, eventNames, maxValue } = useMemo(() => {
		// Prefer timeseries data if available
		if (timeseriesEvents?.data && timeseriesEvents.data.length > 0) {
			const preparedData = prepareTimeseriesChartData({ timeseriesEvents });
			if (preparedData.eventNames.length !== 0) {
				return preparedData;
			}
			// If no event names, return default data
			return prepareChartData({ events, daysToShow });
		}
		// Otherwise use default data
		return prepareChartData({ events, daysToShow });
	}, [timeseriesEvents, events, daysToShow]);

	const yAxisTicks = maxValue === 0 ? [0, 50, 100, 150, 200] : undefined;

	return (
		<div
			className={cn(
				"flex h-full w-full flex-col transition-colors duration-200",
				eventNames.length === 0
					? "overflow-hidden rounded-lg border border-dashed bg-transparent"
					: TABLE_TRAY_CLASS,
			)}
		>
			{eventNames.length > 0 && (
				<div
					className={cn(
						"flex h-7 shrink-0 items-stretch gap-4 overflow-hidden px-4",
						isLoading && "animate-pulse",
					)}
				>
					{eventNames.map((name) => {
						const entry = totals?.[name] ?? { count: 0, sum: 0 };
						const primary = entry.sum !== entry.count ? entry.sum : entry.count;
						const color = (chartConfig[name] as { color?: string })?.color;
						const showName = eventNames.length <= 3;
						return (
							<div
								key={name}
								className="flex items-center gap-1.5 min-w-0"
								title={`${name}: ${entry.count.toLocaleString()} events${
									entry.sum !== entry.count
										? ` · Σ ${entry.sum.toLocaleString()}`
										: ""
								}`}
							>
								<span
									className="w-2 h-2 rounded-sm shrink-0"
									style={{ background: color }}
								/>
								{showName && (
									<span className="text-subtle text-tiny truncate min-w-0">
										{name}
									</span>
								)}
								<span className="text-muted-foreground text-tiny tabular-nums shrink-0">
									{primary.toLocaleString()}
								</span>
							</div>
						);
					})}
				</div>
			)}
			<ChartContainer
				config={chartConfig}
				className={cn(
					"min-h-0 w-full flex-1",
					eventNames.length > 0 && TABLE_TRAY_SURFACE_CLASS,
				)}
			>
				<BarChart
					// accessibilityLayer
					data={chartData}
					className={cn(
						"[&_.recharts-cartesian-grid-bg]:fill-white dark:[&_.recharts-cartesian-grid-bg]:fill-gray-900 [&_.recharts-cartesian-grid-bg]:stroke-border [&_.recharts-cartesian-grid-bg]:stroke-1 [&_.recharts-cartesian-grid-bg]:[rx:8px] pt-3 pr-2",
						isLoading && "animate-pulse",
					)}
					barCategoryGap={4}
				>
					{eventNames.length > 0 && !isLoading && (
						<CartesianGrid
							vertical={false}
							className="fill-white dark:fill-gray-900"
							stroke="var(--chart-grid-stroke)"
							strokeWidth={1}
							strokeDasharray="2 2"
							horizontalPoints={[5, 50, 100, 150, 200]}
						/>
					)}
					<XAxis
						dataKey="date"
						tickLine={false}
						tickMargin={4}
						axisLine={false}
						strokeWidth={1}
						// interval={3}
						interval="equidistantPreserveStart"
						stroke="#f7f7f7"
						tick={{ fontSize: 11, fill: "#666" }}
					/>
					<YAxis
						// domain={[0, Math.round(maxValue * 1.2)]}
						dataKey={eventNames[0] ?? "default"}
						ticks={yAxisTicks}
						tickCount={5}
						tickLine={false}
						axisLine={false}
						width={40}
						tickMargin={0}
						tick={{
							fontSize: 11,
							fill: "#666",
							textAnchor: "middle",
							dx: -15,
							dy: -3,
						}}
						tickFormatter={formatYAxisTick}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					{eventNames.map((eventName: string, index: number) => (
						<Bar
							key={eventName}
							dataKey={eventName}
							stackId="a"
							barSize={20}
							fill={`var(--color-${eventName})`}
							isAnimationActive={!isSheetOpen}
							// animationDuration={300}
							// animationEasing="ease-out"
							// animationBegin={1}
							// radius={
							// 	index === eventNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
							// }
						/>
					))}
				</BarChart>
			</ChartContainer>
		</div>
	);
}
