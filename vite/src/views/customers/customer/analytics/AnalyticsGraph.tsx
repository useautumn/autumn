import {
	memo,
	startTransition,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import type { Row } from "./components/analytics-types";
import { useAnalyticsQueryState } from "./hooks/useAnalyticsQueryState";
import {
	CHART_MARGIN,
	type PlotInsets,
	Y_AXIS_WIDTH,
} from "./utils/chartGeometry";
import { formatCompactNumber, formatPeriodLabel } from "./utils/parseTimestamp";

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
			<span className="flex-1 truncate text-tertiary-foreground">{label}</span>
			<span className="tabular-nums text-muted-foreground">
				{Number(item.value).toLocaleString()}
			</span>
		</div>
	);
}

export const EventsBarChart = memo(function EventsBarChart({
	data,
	chartConfig,
	domainMax,
	onGeometry,
}: {
	data: {
		meta: any[];
		rows: number;
		data: Row[];
	};
	chartConfig: ChartSeriesConfig[];
	domainMax?: number;
	onGeometry?: (insets: PlotInsets) => void;
}) {
	const { queryStates } = useAnalyticsQueryState();
	const selectedInterval = queryStates.interval;
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const [activeRow, setActiveRow] = useState<Row | null>(null);
	const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
		null,
	);
	const containerRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container || !onGeometry) {
			return;
		}
		const measure = () => {
			const grid = container.querySelector(".recharts-cartesian-grid");
			if (!grid) {
				return;
			}
			const c = container.getBoundingClientRect();
			const g = grid.getBoundingClientRect();
			if (g.width === 0 || g.height === 0) {
				return;
			}
			onGeometry({
				left: Math.round(g.left - c.left),
				right: Math.round(c.right - g.right),
				top: Math.round(g.top - c.top),
				bottom: Math.round(c.bottom - g.bottom),
			});
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		return () => observer.disconnect();
	}, [onGeometry, data]);

	const handleBarMouseEnter = useCallback(
		(dataKey: string) => (entry: any) =>
			startTransition(() => {
				setHoveredKey(dataKey);
				setActiveRow(entry?.payload ?? null);
			}),
		[],
	);
	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		const rect = containerRef.current?.getBoundingClientRect();
		if (rect)
			setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
	}, []);
	const handleChartMouseLeave = useCallback(() => {
		setHoveredKey(null);
		setActiveRow(null);
		setMousePos(null);
	}, []);

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

	const tooltipData = useMemo(() => {
		if (!activeRow) return null;
		const allItems = chartConfig
			.map((s) => ({
				dataKey: s.yKey,
				value: Number(activeRow[s.yKey] ?? 0),
				color: s.fill,
			}))
			.filter((i) => i.value !== 0);
		const items = hoveredKey
			? allItems.filter((i) => i.dataKey === hoveredKey)
			: allItems.sort((a, b) => b.value - a.value);
		if (!items.length) return null;
		return { period: String(activeRow.period), items };
	}, [activeRow, hoveredKey, chartConfig]);

	const barHandlers = useMemo(
		() => chartConfig.map((series) => handleBarMouseEnter(series.yKey)),
		[chartConfig, handleBarMouseEnter],
	);

	const visible = tooltipData?.items.slice(0, MAX_TOOLTIP_ITEMS) ?? [];
	const overflow = (tooltipData?.items.length ?? 0) - visible.length;
	const overflowSum =
		overflow > 0
			? tooltipData!.items
					.slice(MAX_TOOLTIP_ITEMS)
					.reduce((s, i) => s + i.value, 0)
			: 0;

	return (
		<div
			ref={containerRef}
			className="h-full w-full relative"
			onMouseMove={handleMouseMove}
			onMouseLeave={handleChartMouseLeave}
		>
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
					margin={CHART_MARGIN}
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
						width={Y_AXIS_WIDTH}
						tickMargin={0}
						tickCount={5}
						domain={domainMax != null ? [0, domainMax] : undefined}
						tick={Y_TICK}
						tickFormatter={formatCompactNumber}
					/>
					{chartConfig.map((series, si) => (
						<Bar
							key={series.yKey}
							dataKey={series.yKey}
							stackId="a"
							fill={series.fill}
							activeBar={false}
							style={CHART_STYLE}
							onMouseEnter={barHandlers[si]}
							isAnimationActive={false}
						/>
					))}
				</BarChart>
			</ChartContainer>
			{tooltipData && mousePos && (
				<div
					className="pointer-events-none absolute z-50 bg-popover text-popover-foreground grid min-w-[8rem] items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs shadow-md ring-1 ring-foreground/10"
					style={{
						top: mousePos.y - 12,
						...((containerRef.current?.offsetWidth ?? 0) - mousePos.x < 200
							? {
									right:
										(containerRef.current?.offsetWidth ?? 0) - mousePos.x + 12,
								}
							: { left: mousePos.x + 12 }),
					}}
				>
					<div className="font-medium">{formatXAxis(tooltipData.period)}</div>
					<div className="grid gap-1">
						{visible.map((item) => (
							<TooltipItem
								key={item.dataKey}
								item={item}
								label={
									(rechartsConfig[item.dataKey]?.label as string) ??
									item.dataKey
								}
							/>
						))}
						{overflow > 0 && (
							<div className="flex items-center gap-2 text-muted-foreground">
								<span className="h-2.5 w-2.5 shrink-0" />
								<span className="flex-1">+{overflow} more</span>
								<span className="tabular-nums">
									{overflowSum.toLocaleString()}
								</span>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
});
