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

export function CustomerUsageAnalyticsChart({
	timeseriesEvents,
	events = [],
	daysToShow = 7,
}: {
	timeseriesEvents?: TimeseriesData;
	events?: Event[];
	daysToShow?: number;
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
			if (preparedData.eventNames.length !== 0) return preparedData;
			//if no event names return default data
			else return prepareChartData({ events, daysToShow });
		}
		//otherwise this is default data
		return prepareChartData({ events, daysToShow });
	}, [timeseriesEvents, events, daysToShow]);

	const yAxisTicks = maxValue === 0 ? [0, 50, 100, 150, 200] : undefined;
	// console.log("yAxisTicks: ", yAxisTicks);

	return (
		<ChartContainer
			config={chartConfig}
			className="h-full pt-3 pr-2 w-full relative bg-interactive-secondary dark:bg-card border rounded-lg"
		>
			<BarChart
				// accessibilityLayer
				data={chartData}
				className="[&_.recharts-cartesian-grid-bg]:fill-white dark:[&_.recharts-cartesian-grid-bg]:fill-gray-900 [&_.recharts-cartesian-grid-bg]:stroke-border [&_.recharts-cartesian-grid-bg]:stroke-1 [&_.recharts-cartesian-grid-bg]:[rx:8px] absolute top-1"
				barCategoryGap={4}
			>
				<CartesianGrid
					vertical={false}
					className="fill-white dark:fill-gray-900"
					stroke="var(--chart-grid-stroke)"
					strokeWidth={1}
					strokeDasharray="2 2"
					// verticalPoints={[20]}
					horizontalPoints={[5, 50, 100, 150, 200]}
				/>
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
	);
}
