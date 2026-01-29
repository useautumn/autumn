import { useEffect, useState } from "react";

/**
 * Hook that returns true after the component has mounted and the browser has completed a paint cycle.
 * Useful for deferring rendering until layout is stable, preventing visual glitches on navigation.
 */
export function useMounted(): boolean {
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			setIsMounted(true);
		});
		return () => cancelAnimationFrame(frame);
	}, []);

	return isMounted;
}
