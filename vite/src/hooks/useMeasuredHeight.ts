import { useLayoutEffect, useRef, useState } from "react";

/**
 * Tracks an element's content height via ResizeObserver so a wrapper can
 * tween between sizes. Returns null until first measured to avoid a 0→h jump.
 */
export function useMeasuredHeight<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [height, setHeight] = useState<number | null>(null);

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;

		const observer = new ResizeObserver(([entry]) => {
			setHeight(entry.contentRect.height);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return { ref, height };
}
