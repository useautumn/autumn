import {
	startTransition,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Row } from "../components/analytics-types";
import type { TooltipEntry } from "../components/tooltipItemLink";
import type { PlotInsets } from "../utils/chartGeometry";
import type { ChartSeriesConfig } from "../utils/transformGroupedChartData";

/**
 * Hover + pin state machine for the events bar chart: which column is active,
 * which segment is hovered, whether the card is pinned, and where it sits.
 */
export const usePinnedChartTooltip = ({
	data,
	chartConfig,
	onGeometry,
}: {
	data: { data: Row[] };
	chartConfig: ChartSeriesConfig[];
	onGeometry?: (insets: PlotInsets) => void;
}) => {
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	// The period key, not the row: a refetch replaces every row object, and a
	// held reference would keep showing the numbers from before the refetch.
	const [activePeriod, setActivePeriod] = useState<string | null>(null);
	const [pinned, setPinnedState] = useState(false);
	// Handlers baked into the memoized recharts tree read the pin through this
	// ref, so pinning never invalidates that memo. Always write both together.
	const pinnedRef = useRef(false);
	const setPinned = useCallback((next: boolean) => {
		pinnedRef.current = next;
		setPinnedState(next);
	}, []);
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

	// Fixed positioning in viewport coords: the animated card wrapper creates a
	// stacking context, so an absolute tooltip gets clipped at the card edge.
	const positionTooltip = useCallback(() => {
		const tooltip = tooltipRef.current;
		if (!tooltip) return;
		let anchor = pinnedAnchorRef.current;
		if (!anchor) {
			const pos = lastMousePos.current;
			const rect = containerRef.current?.getBoundingClientRect();
			if (!pos || !rect) return;
			anchor = { clientX: rect.left + pos.x, clientY: rect.top + pos.y };
		}
		const { clientX, clientY } = anchor;
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
		(dataKey: string) => () => {
			liveHoveredKeyRef.current = dataKey;
			if (pinnedRef.current) return;
			startTransition(() => setHoveredKey(dataKey));
		},
		[],
	);
	const handleBarMouseLeave = useCallback(() => {
		liveHoveredKeyRef.current = null;
		if (pinnedRef.current) return;
		startTransition(() => setHoveredKey(null));
	}, []);

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
			if (pinnedRef.current) return;
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const x = e.clientX - rect.left;
			lastMousePos.current = { x, y: e.clientY - rect.top };
			positionTooltip();

			const row = resolveRowAt(x);
			if (row === undefined) return;
			startTransition(() => setActivePeriod(row ? String(row.period) : null));
		},
		[positionTooltip, resolveRowAt],
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
			setActivePeriod(String(row.period));
			setPinned(true);
			// Re-pinning to the same row and segment changes no state, so the
			// reposition effect would not fire and the card would sit at the old anchor.
			positionTooltip();
		},
		[positionTooltip, resolveRowAt, setPinned],
	);

	const unpin = useCallback(() => {
		pinnedAnchorRef.current = null;
		lastMousePos.current = null;
		liveHoveredKeyRef.current = null;
		setPinned(false);
		setHoveredKey(null);
		setActivePeriod(null);
	}, [setPinned]);

	const handleChartMouseLeave = useCallback(() => {
		if (pinnedRef.current) return;
		setHoveredKey(null);
		setActivePeriod(null);
		lastMousePos.current = null;
		liveHoveredKeyRef.current = null;
	}, []);

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

	const tooltipData = useMemo(() => {
		const activeRow =
			activePeriod === null
				? undefined
				: data.data.find((row) => String(row.period) === activePeriod);
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
	}, [activePeriod, hoveredKey, chartConfig, data]);

	// A refetch can drop the pinned period, leaving a pin with no card and so no
	// visible way to unpin. Reset instead of stranding the chart.
	useEffect(() => {
		if (pinned && !tooltipData) unpin();
	}, [pinned, tooltipData, unpin]);

	const barHandlers = useMemo(
		() => chartConfig.map((series) => handleBarMouseEnter(series.yKey)),
		[chartConfig, handleBarMouseEnter],
	);

	// Position before paint so the tooltip never flashes at a stale corner.
	useLayoutEffect(() => {
		if (tooltipData) positionTooltip();
	}, [tooltipData, positionTooltip]);

	return {
		containerRef,
		tooltipRef,
		pinned,
		tooltipData,
		// Nothing to anchor a card to until the cursor has been over the plot.
		hasTooltipAnchor: pinned || !!lastMousePos.current,
		barHandlers,
		handleBarMouseLeave,
		handleMouseMove,
		handleChartMouseLeave,
		handleChartClick,
		unpin,
	};
};
