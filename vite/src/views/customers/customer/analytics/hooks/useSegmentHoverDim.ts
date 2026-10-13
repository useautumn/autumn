import { type RefObject, useCallback, useRef } from "react";

const BAR_SEGMENT_SELECTOR = ".recharts-bar-rectangle";
// Read by AnalyticsGraph's `[&[data-segment-hover]_…]` class, which dims the other segments.
const SEGMENT_HOVER_ATTR = "data-segment-hover";
// Crossing the gap between two bars takes less than this, so the dim holds instead of flashing off.
const UNDIM_DELAY_MS = 100;

/**
 * Dims the other bar segments while one is hovered. A `:has(:hover)` rule restyled
 * every bar on each segment change, so this flips one attribute only when hover state changes.
 */
export const useSegmentHoverDim = ({
	containerRef,
}: {
	containerRef: RefObject<HTMLElement | null>;
}) => {
	const undimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const setDimmed = useCallback(
		(dimmed: boolean) => {
			if (undimTimerRef.current) clearTimeout(undimTimerRef.current);
			undimTimerRef.current = null;
			const container = containerRef.current;
			if (!container || container.hasAttribute(SEGMENT_HOVER_ATTR) === dimmed)
				return;
			container.toggleAttribute(SEGMENT_HOVER_ATTR, dimmed);
		},
		[containerRef],
	);

	// Every flip restyles every segment, so leaving a segment undims only once the cursor stays off bars.
	const trackSegmentHover = useCallback(
		(target: EventTarget) => {
			const isOverSegment =
				target instanceof Element &&
				target.closest(BAR_SEGMENT_SELECTOR) !== null;
			if (isOverSegment) {
				setDimmed(true);
				return;
			}
			const isDimmed = containerRef.current?.hasAttribute(SEGMENT_HOVER_ATTR);
			if (!isDimmed || undimTimerRef.current) return;
			undimTimerRef.current = setTimeout(
				() => setDimmed(false),
				UNDIM_DELAY_MS,
			);
		},
		[containerRef, setDimmed],
	);

	const clearSegmentHover = useCallback(() => setDimmed(false), [setDimmed]);

	return { trackSegmentHover, clearSegmentHover };
};
