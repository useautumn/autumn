import { useEffect, useMemo, useRef } from "react";
import {
	useWorkbenchStore,
	WORKBENCH_MAX_HEIGHT_RATIO,
	WORKBENCH_MIN_HEIGHT,
} from "@/hooks/stores/useWorkbenchStore";

const clampHeight = (h: number) =>
	Math.max(
		WORKBENCH_MIN_HEIGHT,
		Math.min(window.innerHeight * WORKBENCH_MAX_HEIGHT_RATIO, h),
	);

export const useWorkbenchResize = () => {
	const setHeight = useWorkbenchStore((s) => s.setHeight);
	const dragStartY = useRef<number | null>(null);
	const dragStartHeight = useRef(0);

	const handleProps = useMemo(
		() => ({
			onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
				e.preventDefault();
				dragStartY.current = e.clientY;
				dragStartHeight.current = useWorkbenchStore.getState().height;
				e.currentTarget.setPointerCapture(e.pointerId);
			},
			onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
				if (dragStartY.current == null) return;
				const delta = dragStartY.current - e.clientY;
				setHeight(clampHeight(dragStartHeight.current + delta));
			},
			onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
				dragStartY.current = null;
				e.currentTarget.releasePointerCapture(e.pointerId);
			},
			onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
				dragStartY.current = null;
				e.currentTarget.releasePointerCapture(e.pointerId);
			},
		}),
		[setHeight],
	);

	useEffect(() => {
		const onResize = () =>
			setHeight(clampHeight(useWorkbenchStore.getState().height));
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [setHeight]);

	return { handleProps };
};
