import {
	animate,
	type PanInfo,
	useMotionValue,
	useReducedMotion,
} from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

const GAP = 12;
const SNAP_SPRING = { type: "spring", stiffness: 320, damping: 38 } as const;
const FLICK_VELOCITY = 320;

type MobileCarousel = {
	containerRef: React.RefObject<HTMLDivElement | null>;
	x: ReturnType<typeof useMotionValue<number>>;
	activeIndex: number;
	stepWidth: number;
	goTo: (index: number) => void;
	onDragEnd: (event: unknown, info: PanInfo) => void;
};

const wrap = (index: number, count: number) =>
	((index % count) + count) % count;

export function useMobileCarousel(count: number): MobileCarousel {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const x = useMotionValue(0);
	const [activeIndex, setActiveIndex] = useState(0);
	const [stepWidth, setStepWidth] = useState(0);
	const reduceMotion = useReducedMotion();

	useLayoutEffect(() => {
		const measure = () => {
			const card = containerRef.current
				?.firstElementChild as HTMLElement | null;
			setStepWidth(card ? card.offsetWidth + GAP : 0);
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);

	// Animate toward a (possibly out-of-range) slot, then jump to the wrapped
	// equivalent so the track stays in range and the loop feels seamless.
	const settle = useCallback(
		(slot: number) => {
			const wrapped = wrap(slot, count);
			setActiveIndex(wrapped);
			if (reduceMotion) {
				x.set(-wrapped * stepWidth);
				return;
			}
			animate(x, -slot * stepWidth, SNAP_SPRING).then(() => {
				if (slot !== wrapped) x.set(-wrapped * stepWidth);
			});
		},
		[count, reduceMotion, stepWidth, x],
	);

	const goTo = useCallback(
		(index: number) => settle(wrap(index, count)),
		[count, settle],
	);

	const onDragEnd = useCallback(
		(_event: unknown, info: PanInfo) => {
			if (!stepWidth) return;
			const projected = -x.get() / stepWidth;
			let slot = Math.round(projected);
			if (info.velocity.x < -FLICK_VELOCITY) slot = Math.ceil(projected);
			else if (info.velocity.x > FLICK_VELOCITY) slot = Math.floor(projected);
			slot = Math.max(activeIndex - 1, Math.min(activeIndex + 1, slot));
			settle(slot);
		},
		[activeIndex, settle, stepWidth, x],
	);

	return { containerRef, x, activeIndex, stepWidth, goTo, onDragEnd };
}
