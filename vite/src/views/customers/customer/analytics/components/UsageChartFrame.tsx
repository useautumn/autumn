import { type ChartConfig, ChartContainer } from "@autumn/ui";
import type { ReactNode } from "react";
import {
	BarChart,
	CartesianGrid,
	XAxis,
	type XAxisProps,
	YAxis,
} from "recharts";
import {
	CHART_MARGIN,
	X_AXIS_HEIGHT,
	Y_AXIS_WIDTH,
} from "../utils/chartGeometry";
import { formatCompactNumber } from "../utils/parseTimestamp";

const CHART_STYLE = { cursor: "default" } as const;
const X_TICK = { fontSize: 11, fill: "#666" } as const;
const Y_TICK = {
	fontSize: 11,
	fill: "#666",
	textAnchor: "middle" as const,
	dx: -15,
	dy: -3,
} as const;
const NO_LABEL = () => "";

/** The usage chart's box, grid and axes. The loaded chart and its skeleton both render through it, so the swap cannot move them. */
export const UsageChartFrame = ({
	config,
	data,
	ticks,
	barCategoryGap,
	formatXTick,
	showYTicks,
	chartKey,
	children,
}: {
	config: ChartConfig;
	data: readonly object[];
	ticks?: number[];
	barCategoryGap: number | string;
	formatXTick: XAxisProps["tickFormatter"];
	showYTicks: boolean;
	chartKey?: string;
	children?: ReactNode;
}) => (
	<ChartContainer
		config={config}
		className="h-full w-full [&_*:focus]:outline-none"
	>
		<BarChart
			key={chartKey}
			data={data}
			margin={CHART_MARGIN}
			barCategoryGap={barCategoryGap}
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
				height={X_AXIS_HEIGHT}
				tickLine={false}
				tickMargin={4}
				axisLine={false}
				interval="equidistantPreserveStart"
				tick={X_TICK}
				tickFormatter={formatXTick}
			/>
			<YAxis
				tickLine={false}
				axisLine={false}
				width={Y_AXIS_WIDTH}
				tickMargin={0}
				ticks={ticks}
				domain={ticks ? [0, ticks[ticks.length - 1]] : undefined}
				tick={Y_TICK}
				// Blank labels, not tick={false}, which also drops the ticks the gridlines are drawn on.
				tickFormatter={showYTicks ? formatCompactNumber : NO_LABEL}
			/>
			{children}
		</BarChart>
	</ChartContainer>
);
