import { type RefObject, useCallback, useRef } from "react";

const BAR_SEGMENT_SELECTOR = ".recharts-bar-rectangle";
const SEGMENT_HOVER_ATTR = "data-segment-hover";
const UNDIM_DELAY_MS = 100;

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
