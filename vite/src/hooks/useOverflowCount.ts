import { useLayoutEffect, useRef, useState } from "react";

/**
 * Measures how many fixed-order children fit on one row, reserving room for a
 * trailing overflow indicator when not everything fits.
 *
 * Render every item into `measureRef` off-screen at natural width, followed by
 * the indicator template last; the visible row renders only `visibleCount`.
 */
export function useOverflowCount({
	itemCount,
	gap,
	enabled = true,
	hasIndicator = false,
}: {
	itemCount: number;
	gap: number;
	enabled?: boolean;
	hasIndicator?: boolean;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const measureRef = useRef<HTMLDivElement>(null);
	const [visibleCount, setVisibleCount] = useState(itemCount);

	useLayoutEffect(() => {
		// Keep the last measured count when disabled — resetting it makes callers
		// that gate UI on `visibleCount < itemCount` flicker for one render.
		if (!enabled) return;

		const container = containerRef.current;
		const measure = measureRef.current;
		if (!container || !measure) return;

		const recompute = () => {
			const containerWidth = container.clientWidth;
			if (!containerWidth) return;

			const children = Array.from(measure.children) as HTMLElement[];
			const widthOf = (el: HTMLElement) => el.getBoundingClientRect().width;
			const itemEls = hasIndicator ? children.slice(0, -1) : children;
			const indicatorWidth =
				hasIndicator && children.length > 0
					? widthOf(children[children.length - 1])
					: 0;

			const fitCount = (reserved: number) => {
				let running = reserved;
				let fitted = 0;
				for (const itemEl of itemEls) {
					const next = running + (fitted > 0 ? gap : 0) + widthOf(itemEl);
					if (next > containerWidth) break;
					running = next;
					fitted += 1;
				}
				return fitted;
			};

			// Everything fits with no indicator — show it all.
			if (fitCount(0) === itemEls.length) {
				setVisibleCount(itemEls.length);
				return;
			}

			// Always show at least one item, even if it alone overflows.
			setVisibleCount(Math.max(fitCount(indicatorWidth + gap), 1));
		};

		recompute();

		// Only width matters. Observing height too would re-measure on every frame
		// of a container height animation, thrashing the count mid-transition.
		let lastWidth = container.clientWidth;
		const observer = new ResizeObserver(() => {
			const width = container.clientWidth;
			if (width === lastWidth) return;
			lastWidth = width;
			recompute();
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, [itemCount, gap, enabled, hasIndicator]);

	return { containerRef, measureRef, visibleCount };
}
