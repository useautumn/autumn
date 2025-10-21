import { useCallback, useRef } from "react";

interface UseClickWithoutDragOptions {
	threshold?: number;
}

/**
 * Hook to detect genuine clicks vs drag operations
 * Only triggers callback if mouse up is close to mouse down position
 */
export function useClickWithoutDrag(
	callback: (e: React.MouseEvent) => void,
	{ threshold = 5 }: UseClickWithoutDragOptions = {},
) {
	const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		mouseDownPos.current = { x: e.clientX, y: e.clientY };
	}, []);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			if (!mouseDownPos.current) {
				callback(e);
				return;
			}

			const dx = Math.abs(e.clientX - mouseDownPos.current.x);
			const dy = Math.abs(e.clientY - mouseDownPos.current.y);
			const distance = Math.sqrt(dx * dx + dy * dy);

			// Only trigger callback if mouse didn't move much (not a drag)
			if (distance <= threshold) {
				callback(e);
			}

			mouseDownPos.current = null;
		},
		[callback, threshold],
	);

	return { handleMouseDown, handleClick };
}
