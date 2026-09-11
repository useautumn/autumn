import { useLayoutEffect } from "react";

/**
 * Reserves the scrollbar gutter on the app's scroll container while mounted.
 * Steps expand to different heights, so without this the scrollbar appears and
 * disappears as you move between them, shifting the whole page sideways.
 *
 * Scoped to this page: the container is shared, so it's restored on unmount.
 */
export const useStableScrollbar = () => {
	useLayoutEffect(() => {
		const container = document.querySelector<HTMLElement>(
			"[data-main-content]",
		);
		if (!container) return;

		const previous = container.style.scrollbarGutter;
		container.style.scrollbarGutter = "stable";

		return () => {
			container.style.scrollbarGutter = previous;
		};
	}, []);
};
