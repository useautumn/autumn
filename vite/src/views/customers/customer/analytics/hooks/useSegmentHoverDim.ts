import { type RefObject, useCallback } from "react";

const BAR_SEGMENT_SELECTOR = ".recharts-bar-rectangle";
// Read by AnalyticsGraph's `[&[data-segment-hover]_…]` class, which dims the other segments.
const SEGMENT_HOVER_ATTR = "data-segment-hover";

/**
 * Dims the other bar segments while one is hovered. A `:has(:hover)` rule restyled
 * every bar on each segment change, so this flips one attribute only when hover state changes.
 */
export const useSegmentHoverDim = ({
	containerRef,
}: {
	containerRef: RefObject<HTMLElement | null>;
}) => {
	const setDimmed = useCallback(
		(dimmed: boolean) => {
			const container = containerRef.current;
			if (!container || container.hasAttribute(SEGMENT_HOVER_ATTR) === dimmed)
				return;
			container.toggleAttribute(SEGMENT_HOVER_ATTR, dimmed);
		},
		[containerRef],
	);

	const trackSegmentHover = useCallback(
		(target: EventTarget) =>
			setDimmed(
				target instanceof Element &&
					target.closest(BAR_SEGMENT_SELECTOR) !== null,
			),
		[setDimmed],
	);

	const clearSegmentHover = useCallback(() => setDimmed(false), [setDimmed]);

	return { trackSegmentHover, clearSegmentHover };
};
