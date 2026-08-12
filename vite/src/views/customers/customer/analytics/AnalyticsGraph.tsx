import { type ChartConfig, ChartContainer } from "@autumn/ui";
import {
	memo,
	startTransition,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
	const containerRef = useRef<HTMLDivElement>(null);

	// Cursor tracking is imperative: a per-pixel setState here re-renders the
	// whole recharts tree per mousemove, which is what made the tooltip choppy.
	const tooltipRef = useRef<HTMLDivElement>(null);
	const lastMousePos = useRef<{ x: number; y: number } | null>(null);

	// Fixed positioning in viewport coords: the animated card wrapper creates a
	// stacking context, so an absolute tooltip gets clipped at the card edge.
	const positionTooltip = useCallback(() => {
		const tooltip = tooltipRef.current;
		const pos = lastMousePos.current;
		const rect = containerRef.current?.getBoundingClientRect();
		if (!tooltip || !pos || !rect) return;
		const clientX = rect.left + pos.x;
		const clientY = rect.top + pos.y;
		tooltip.style.top = `${clientY - 12}px`;
		if (window.innerWidth - clientX < 200) {
			tooltip.style.left = "auto";
			tooltip.style.right = `${window.innerWidth - clientX + 12}px`;
		} else {
			tooltip.style.right = "auto";
			tooltip.style.left = `${clientX + 12}px`;
		}
	}, []);

	// Plot-area x-range, used to resolve which column the cursor is over.
	const plotXRef = useRef<{ left: number; width: number } | null>(null);
	// Lets mousemove retry when the first measure ran before recharts drew the
	// grid — the ResizeObserver never refires if the container size is stable.
	const measureRef = useRef<(() => void) | null>(null);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) {
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
			plotXRef.current = { left: g.left - c.left, width: g.width };
			onGeometry?.({
				left: Math.round(g.left - c.left),
				right: Math.round(c.right - g.right),
				top: Math.round(g.top - c.top),
				bottom: Math.round(c.bottom - g.bottom),
			});
		};
		measureRef.current = measure;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		return () => {
			observer.disconnect();
			measureRef.current = null;
		};
	}, [onGeometry, data]);

	// Segment hover narrows the tooltip to that series; the active COLUMN is
	// resolved from the cursor's x against the measured plot area, so hovering
	// empty space above a bar still shows that column's full stack. Deliberately
	// not recharts' activeTooltipIndex — it does not reach chart-level handlers
	// in this setup, which is exactly the bug this replaces.
	const handleBarMouseEnter = useCallback(
		(dataKey: string) => () => startTransition(() => setHoveredKey(dataKey)),
		[],
	);
	const handleBarMouseLeave = useCallback(
		() => startTransition(() => setHoveredKey(null)),
		[],
	);
	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const x = e.clientX - rect.left;
			lastMousePos.current = { x, y: e.clientY - rect.top };
			positionTooltip();

			if (!plotXRef.current) measureRef.current?.();
			const plot = plotXRef.current;
			const count = data.data.length;
			if (!plot || count === 0 || plot.width <= 0) return;
			const index = Math.floor(((x - plot.left) / plot.width) * count);
			const row = index >= 0 && index < count ? data.data[index] : null;
			startTransition(() =>
				setActiveRow((prev) => (prev === row ? prev : row)),
			);
		},
		[data, positionTooltip],
	);
	const handleChartMouseLeave = useCallback(() => {
		setHoveredKey(null);
		setActiveRow(null);
		lastMousePos.current = null;
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
		// A stale or zero-valued hoveredKey must not blank the tooltip while the
		// CSS hover state is still lit — fall back to the full stack instead.
		const hoveredItems = hoveredKey
			? allItems.filter((i) => i.dataKey === hoveredKey)
			: [];
		const items = hoveredItems.length
			? hoveredItems
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

	// Memoized so tooltip-driven re-renders never touch the recharts tree.
	const chart = useMemo(
		() => (
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
							onMouseLeave={handleBarMouseLeave}
							isAnimationActive={false}
						/>
					))}
				</BarChart>
			</ChartContainer>
		),
		[
			data,
			rechartsConfig,
			chartConfig,
			domainMax,
			formatXAxis,
			barHandlers,
			handleBarMouseLeave,
		],
	);

	// Position before paint so the tooltip never flashes at a stale corner.
	useLayoutEffect(() => {
		if (tooltipData) positionTooltip();
	}, [tooltipData, positionTooltip]);

	return (
		<div
			ref={containerRef}
			className="h-full w-full relative"
			onMouseMove={handleMouseMove}
			onMouseLeave={handleChartMouseLeave}
		>
			{chart}
			{/* Portaled: sticky table headers and animated card wrappers otherwise
			    win the stacking-context fight regardless of z-index. */}
			{tooltipData &&
				lastMousePos.current &&
				createPortal(
					<div
						ref={tooltipRef}
						className="pointer-events-none fixed z-[100] bg-popover text-popover-foreground grid min-w-[8rem] items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs shadow-md ring-1 ring-foreground/10"
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
					</div>,
					document.body,
				)}
		</div>
	);
});
