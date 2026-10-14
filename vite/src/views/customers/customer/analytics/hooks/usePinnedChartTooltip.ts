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
import type { ChartSeriesConfig } from "../utils/transformGroupedChartData";
import { useSegmentHoverDim } from "./useSegmentHoverDim";

export const usePinnedChartTooltip = ({
	data,
	chartConfig,
}: {
	data: { data: Row[] };
	chartConfig: ChartSeriesConfig[];
}) => {
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const [activePeriod, setActivePeriod] = useState<string | null>(null);
	const [pinned, setPinnedState] = useState(false);
	const pinnedRef = useRef(false);
	const setPinned = useCallback((next: boolean) => {
		pinnedRef.current = next;
		setPinnedState(next);
	}, []);
	const containerRef = useRef<HTMLDivElement>(null);
	const { trackSegmentHover, clearSegmentHover } = useSegmentHoverDim({
		containerRef,
	});

	const tooltipRef = useRef<HTMLDivElement>(null);
	const lastMousePos = useRef<{ x: number; y: number } | null>(null);
	const pinnedAnchorRef = useRef<{ clientX: number; clientY: number } | null>(
		null,
	);
	const liveHoveredKeyRef = useRef<string | null>(null);

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

	const plotXRef = useRef<{ left: number; width: number } | null>(null);
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
		};
		measureRef.current = measure;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		return () => {
			observer.disconnect();
			measureRef.current = null;
		};
	}, [data]);

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
			trackSegmentHover(e.target);
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
		[trackSegmentHover, positionTooltip, resolveRowAt],
	);

	const handleChartClick = useCallback(
		(e: React.MouseEvent) => {
			// The tooltip is portaled but still a React child, so its clicks bubble
			if (tooltipRef.current?.contains(e.target as Node)) return;
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const row = resolveRowAt(e.clientX - rect.left);
			if (!row) return;
			pinnedAnchorRef.current = { clientX: e.clientX, clientY: e.clientY };
			setHoveredKey(liveHoveredKeyRef.current);
			setActivePeriod(String(row.period));
			setPinned(true);
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
		clearSegmentHover();
		if (pinnedRef.current) return;
		setHoveredKey(null);
		setActivePeriod(null);
		lastMousePos.current = null;
		liveHoveredKeyRef.current = null;
	}, [clearSegmentHover]);

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
		const hoveredItems = hoveredKey
			? allItems.filter((i) => i.dataKey === hoveredKey)
			: [];
		const items = hoveredItems.length
			? hoveredItems
			: allItems.sort((a, b) => b.value - a.value);
		if (!items.length) return null;
		return { period: String(activeRow.period), items };
	}, [activePeriod, hoveredKey, chartConfig, data]);

	useEffect(() => {
		if (pinned && !tooltipData) unpin();
	}, [pinned, tooltipData, unpin]);

	const barHandlers = useMemo(
		() => chartConfig.map((series) => handleBarMouseEnter(series.yKey)),
		[chartConfig, handleBarMouseEnter],
	);

	useLayoutEffect(() => {
		if (tooltipData) positionTooltip();
	}, [tooltipData, positionTooltip]);

	return {
		containerRef,
		tooltipRef,
		pinned,
		tooltipData,
		hasTooltipAnchor: pinned || !!lastMousePos.current,
		barHandlers,
		handleBarMouseLeave,
		handleMouseMove,
		handleChartMouseLeave,
		handleChartClick,
		unpin,
	};
};
