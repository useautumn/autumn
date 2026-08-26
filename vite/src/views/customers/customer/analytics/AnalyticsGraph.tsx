import { type ChartConfig, ChartContainer } from "@autumn/ui";
import { X } from "lucide-react";
import {
	memo,
	startTransition,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
import type { Row } from "./components/analytics-types";
import { useAnalyticsQueryState } from "./hooks/useAnalyticsQueryState";
import {
	CHART_MARGIN,
	type PlotInsets,
	Y_AXIS_WIDTH,
} from "./utils/chartGeometry";
import { formatCompactNumber, formatPeriodLabel } from "./utils/parseTimestamp";
import type { ChartSeriesConfig } from "./utils/transformGroupedChartData";

type TooltipEntry = Pick<
	ChartSeriesConfig,
	"customerId" | "entityId" | "entityCustomerId"
> & {
	dataKey: string;
	value: number;
	color: string;
};

const MAX_TOOLTIP_ITEMS = 5;
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

const tooltipItemHref = ({
	item,
}: {
	item: TooltipEntry;
}): string | undefined => {
	if (item.customerId) {
		return pushPage({
			path: `/customers/${item.customerId}`,
			preserveParams: false,
		});
	}
	if (item.entityId && item.entityCustomerId) {
		return pushPage({
			path: `/customers/${item.entityCustomerId}`,
			queryParams: { entity_id: item.entityId },
		});
	}
	return undefined;
};

function TooltipItem({
	item,
	label,
	href,
}: {
	item: TooltipEntry;
	label: string;
	href?: string;
}) {
	return (
		<div className="flex items-center gap-2">
			<span
				className="h-2.5 w-2.5 shrink-0 rounded-sm"
				style={{ background: item.color }}
			/>
			{href ? (
				<a
					href={href}
					target="_blank"
					rel="noopener"
					className="flex-1 truncate text-tertiary-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
				>
					{label}
				</a>
			) : (
				<span className="flex-1 truncate text-tertiary-foreground">
					{label}
				</span>
			)}
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
	const [pinned, setPinned] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Cursor tracking is imperative: a per-pixel setState here re-renders the
	// whole recharts tree per mousemove, which is what made the tooltip choppy.
	const tooltipRef = useRef<HTMLDivElement>(null);
	const lastMousePos = useRef<{ x: number; y: number } | null>(null);
	// Frozen viewport coords while pinned, so the card stops following the cursor.
	const pinnedAnchorRef = useRef<{ clientX: number; clientY: number } | null>(
		null,
	);
	// What `hoveredKey` would be if a pin were not freezing it — a re-pin reads
	// this so it adopts the segment the cursor is actually over.
	const liveHoveredKeyRef = useRef<string | null>(null);

	const resolveAnchor = useCallback(() => {
		if (pinnedAnchorRef.current) return pinnedAnchorRef.current;
		const pos = lastMousePos.current;
		const rect = containerRef.current?.getBoundingClientRect();
		if (!pos || !rect) return null;
		return { clientX: rect.left + pos.x, clientY: rect.top + pos.y };
	}, []);

	// Fixed positioning in viewport coords: the animated card wrapper creates a
	// stacking context, so an absolute tooltip gets clipped at the card edge.
	const positionTooltip = useCallback(() => {
		const tooltip = tooltipRef.current;
		const anchor = resolveAnchor();
		if (!tooltip || !anchor) return;
		const { clientX, clientY } = anchor;
		tooltip.style.top = `${clientY - 12}px`;
		if (window.innerWidth - clientX < 200) {
			tooltip.style.left = "auto";
			tooltip.style.right = `${window.innerWidth - clientX + 12}px`;
		} else {
			tooltip.style.right = "auto";
			tooltip.style.left = `${clientX + 12}px`;
		}
	}, [resolveAnchor]);

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
		(dataKey: string) => () => {
			liveHoveredKeyRef.current = dataKey;
			if (pinned) return;
			startTransition(() => setHoveredKey(dataKey));
		},
		[pinned],
	);
	const handleBarMouseLeave = useCallback(() => {
		liveHoveredKeyRef.current = null;
		if (pinned) return;
		startTransition(() => setHoveredKey(null));
	}, [pinned]);

	// `undefined` means the plot geometry is not measurable yet, which must not
	// be confused with `null` — the cursor sitting outside every column.
	const resolveRowAt = useCallback(
		(x: number): Row | null | undefined => {
			if (!plotXRef.current) measureRef.current?.();
			const plot = plotXRef.current;
			const count = data.data.length;
			if (!plot || count === 0 || plot.width <= 0) return undefined;
			const index = Math.floor(((x - plot.left) / plot.width) * count);
			return index >= 0 && index < count ? data.data[index] : null;
		},
		[data],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (pinned) return;
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const x = e.clientX - rect.left;
			lastMousePos.current = { x, y: e.clientY - rect.top };
			positionTooltip();

			const row = resolveRowAt(x);
			if (row === undefined) return;
			startTransition(() =>
				setActiveRow((prev) => (prev === row ? prev : row)),
			);
		},
		[pinned, positionTooltip, resolveRowAt],
	);

	const handleChartClick = useCallback(
		(e: React.MouseEvent) => {
			// The tooltip is portaled but still a React child, so its clicks bubble
			// here — re-pinning on a link click would yank the card mid-navigation.
			if (tooltipRef.current?.contains(e.target as Node)) return;
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const row = resolveRowAt(e.clientX - rect.left);
			if (!row) return;
			pinnedAnchorRef.current = { clientX: e.clientX, clientY: e.clientY };
			// The pin must show exactly what the hover tooltip showed — one segment,
			// or the whole stack when the click landed on empty column space.
			setHoveredKey(liveHoveredKeyRef.current);
			setActiveRow(row);
			setPinned(true);
			// Re-pinning to the same row and segment changes no state, so the
			// reposition effect would not fire and the card would sit at the old anchor.
			positionTooltip();
		},
		[positionTooltip, resolveRowAt],
	);

	const unpin = useCallback(() => {
		pinnedAnchorRef.current = null;
		lastMousePos.current = null;
		liveHoveredKeyRef.current = null;
		setPinned(false);
		setHoveredKey(null);
		setActiveRow(null);
	}, []);

	const handleChartMouseLeave = useCallback(() => {
		if (pinned) return;
		setHoveredKey(null);
		setActiveRow(null);
		lastMousePos.current = null;
		liveHoveredKeyRef.current = null;
	}, [pinned]);

	// The tooltip is fixed in viewport coords, so scrolling moves the chart out
	// from under it: dismiss rather than track. A pin is deliberate, so it stays.
	useLayoutEffect(() => {
		const dismiss = () => handleChartMouseLeave();
		window.addEventListener("scroll", dismiss, true);
		window.addEventListener("resize", dismiss);
		return () => {
			window.removeEventListener("scroll", dismiss, true);
			window.removeEventListener("resize", dismiss);
		};
	}, [handleChartMouseLeave]);

	useEffect(() => {
		if (!pinned) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") unpin();
		};
		// Clicks inside the chart fall through to handleChartClick, which re-pins.
		const onMouseDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (tooltipRef.current?.contains(target)) return;
			if (containerRef.current?.contains(target)) return;
			unpin();
		};
		window.addEventListener("keydown", onKeyDown);
		document.addEventListener("mousedown", onMouseDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("mousedown", onMouseDown);
		};
	}, [pinned, unpin]);

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
		const allItems: TooltipEntry[] = chartConfig
			.map((s) => ({
				dataKey: s.yKey,
				value: Number(activeRow[s.yKey] ?? 0),
				color: s.fill,
				customerId: s.customerId,
				entityId: s.entityId,
				entityCustomerId: s.entityCustomerId,
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
			onClick={handleChartClick}
		>
			{chart}
			{/* Portaled: sticky table headers and animated card wrappers otherwise
			    win the stacking-context fight regardless of z-index. */}
			{tooltipData &&
				(pinned || lastMousePos.current) &&
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
