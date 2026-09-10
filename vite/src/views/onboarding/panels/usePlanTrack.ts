import { useState } from "react";

/** Cards visible at once; the track slides by whole cards past that. */
export const VISIBLE_PLANS = 3;

/**
 * A paged track. Card widths never change — only the track's translateX does,
 * so sliding costs no layout and the text inside never reflows.
 */
export const usePlanTrack = ({ count }: { count: number }) => {
	const maxOffset = Math.max(count - VISIBLE_PLANS, 0);
	const [offset, setOffset] = useState(0);
	const current = Math.min(offset, maxOffset);

	return {
		offset: current,
		canGoPrev: current > 0,
		canGoNext: current < maxOffset,
		prev: () => setOffset(Math.max(current - 1, 0)),
		next: () => setOffset(Math.min(current + 1, maxOffset)),
	};
};
