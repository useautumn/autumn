import { memo, startTransition, useCallback, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { useAnalyticsContext } from "./AnalyticsContext";
import type { Row } from "./components/analytics-types";
import {
	formatCompactNumber,
	formatDateShort,
	formatHourMinute,
	parseUTCTimestamp,
} from "./utils/parseTimestamp";

interface ChartSeriesConfig {
	xKey: string;
	yKey: string;
	type: "bar";
	stacked: boolean;
	yName: string;
	fill: string;
}

const MAX_TOOLTIP_ITEMS = 5;
const CHART_STYLE = { cursor: "default" } as const;
const X_TICK = { fontSize: 11, fill: "#666" } as const;
const Y_TICK = {
	fontSize: 11,
	fill: "#666",
	textAnchor: "middle" as const,
	dx: -15,
	dy: -3,
} as const;

function TooltipItem({ item, label }: { item: any; label: string }) {
	return (
		<div className="flex items-center gap-2">
			<span
				className="h-2.5 w-2.5 shrink-0 rounded-sm"
				style={{ background: item.color }}
			/>
			<span className="flex-1 truncate text-tertiary-foreground">
				{label}
			</span>
			<span className="tabular-nums text-muted-foreground">
				{Number(item.value).toLocaleString()}
			</span>
		</div>
	);
}

export const EventsBarChart = memo(function EventsBarChart({
	data,
	chartConfig,
}: {
	data: {
		meta: any[];
		rows: number;
		data: Row[];
	};
	chartConfig: ChartSeriesConfig[];
}) {
	const { selectedInterval } = useAnalyticsContext();
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);

	const handleBarMouseEnter = useCallback(
		(dataKey: string) => () =>
			startTransition(() => setHoveredKey(dataKey)),
		[],
	);
	const handleBarMouseLeave = useCallback(
		() => startTransition(() => setHoveredKey(null)),
		[],
	);

	const formatXAxis = useCallback(
		(value: string): string => {
			const date = parseUTCTimestamp(value);
			if (!Number.isFinite(date.getTime())) return value;
			return selectedInterval === "24h"
				? formatHourMinute(date)
				: formatDateShort(date);
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

	const tooltipContent = useCallback(
		({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string | number }) => {
			if (!active || !payload?.length) return null;
			const items = hoveredKey
				? payload.filter((p: any) => String(p.dataKey) === hoveredKey && Number(p.value) !== 0)
				: [...payload].filter((p: any) => Number(p.value) !== 0).sort((a: any, b: any) => (b.value as number) - (a.value as number));
			if (!items.length) return null;
			const visible = items.slice(0, MAX_TOOLTIP_ITEMS);
			const overflow = items.length - visible.length;
			const overflowSum = overflow > 0
				? items.slice(MAX_TOOLTIP_ITEMS).reduce((s: number, p: any) => s + Number(p.value), 0)
				: 0;
			return (
				<div className="bg-popover text-popover-foreground grid min-w-[8rem] items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs shadow-md ring-1 ring-foreground/10">
					<div className="font-medium">{formatXAxis(String(label))}</div>
					<div className="grid gap-1">
						{visible.map((item: any) => (
							<TooltipItem
								key={String(item.dataKey)}
								item={item}
								label={rechartsConfig[String(item.dataKey)]?.label as string ?? String(item.dataKey)}
							/>
						))}
						{overflow > 0 && (
							<div className="flex items-center gap-2 text-muted-foreground">
								<span className="h-2.5 w-2.5 shrink-0" />
								<span className="flex-1">+{overflow} more</span>
								<span className="tabular-nums">{overflowSum.toLocaleString()}</span>
							</div>
						)}
					</div>
				</div>
			);
		},
		[hoveredKey, formatXAxis, rechartsConfig],
	);

	const barHandlers = useMemo(
		() =>
			chartConfig.map((series) => ({
				onMouseEnter: handleBarMouseEnter(series.yKey),
				onMouseLeave: handleBarMouseLeave,
			})),
		[chartConfig, handleBarMouseEnter, handleBarMouseLeave],
	);

	return (
		<div className="h-full w-full">
			<ChartContainer
				config={rechartsConfig}
				className={cn(
					"h-full w-full",
					"[&_*:focus]:outline-none",
					"[&_.recharts-bar-rectangle]:transition-opacity [&_.recharts-bar-rectangle]:duration-150",
					"[&:has(.recharts-bar-rectangle:hover)_.recharts-bar-rectangle:not(:hover)]:opacity-35",
				)}
			>
				<BarChart
					data={data.data}
					className="pt-3 pr-2"
					barCategoryGap="10%"
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
						width={40}
						tickMargin={0}
						tickCount={5}
						tick={Y_TICK}
						tickFormatter={formatCompactNumber}
					/>
					<Tooltip
						cursor={false}
						isAnimationActive={false}
						content={tooltipContent}
					/>
					{chartConfig.map((series, si) => (
						<Bar
							key={series.yKey}
							dataKey={series.yKey}
							stackId="a"
							fill={series.fill}
							activeBar={false}
							style={CHART_STYLE}
							onMouseEnter={barHandlers[si].onMouseEnter}
							onMouseLeave={barHandlers[si].onMouseLeave}
						/>
					))}
				</BarChart>
			</ChartContainer>
		</div>
	);
});
