"use client";

import type { Event } from "@autumn/shared";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { useIsSheetOpen } from "@/hooks/stores/useSheetStore";
import {
	prepareChartData,
	prepareTimeseriesChartData,
	type TimeseriesData,
} from "./customerUsageAnalyticsUtils";
import { cn } from "@/lib/utils";

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
				"h-full w-full flex flex-col border rounded-lg transition-colors duration-200 overflow-hidden",
				eventNames.length === 0
					? "bg-transparent border-dashed"
					: "bg-interactive-secondary",
			)}
		>
			{eventNames.length > 0 && (
				<div
					className={cn(
						"flex items-stretch h-7 gap-4 px-2 overflow-hidden border-b shrink-0 bg-card",
						isLoading && "animate-pulse",
					)}
				>
					{eventNames.map((name) => {
						const entry = totals?.[name] ?? { count: 0, sum: 0 };
						const primary =
							entry.sum !== entry.count ? entry.sum : entry.count;
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
									<span className="text-t4 text-tiny truncate min-w-0">
										{name}
									</span>
								)}
								<span className="text-t2 text-tiny tabular-nums shrink-0">
									{primary.toLocaleString()}
								</span>
							</div>
						);
					})}
				</div>
			)}
			<ChartContainer
				config={chartConfig}
				className="flex-1 min-h-0 w-full"
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
