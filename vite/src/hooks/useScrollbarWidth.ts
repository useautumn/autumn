import { useEffect, useState } from "react";

/**
 * Detects if a scroll container has a vertical scrollbar and returns the actual width to compensate for it.
 * Useful for aligning fixed headers with scrollable body content.
 */
export function useScrollbarWidth({
	scrollContainer,
	deps = [],
}: {
	scrollContainer: HTMLElement | null;
	deps?: unknown[];
}) {
	const [scrollbarWidth, setScrollbarWidth] = useState(0);

	useEffect(() => {
		if (!scrollContainer) {
			setScrollbarWidth(0);
			return;
		}

		const checkScrollbar = () => {
			// Calculate actual scrollbar width by comparing offset and client width
			const actualScrollbarWidth =
				scrollContainer.offsetWidth - scrollContainer.clientWidth;
			setScrollbarWidth(actualScrollbarWidth);
		};

		checkScrollbar();

		// Use ResizeObserver to detect content size changes
		const observer = new ResizeObserver(checkScrollbar);
		observer.observe(scrollContainer);

		return () => observer.disconnect();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scrollContainer, ...deps]);

	return {
		hasVerticalScrollbar: scrollbarWidth > 0,
		scrollbarWidth,
	};
}
