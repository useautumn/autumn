import {
	animate,
	type PanInfo,
	useMotionValue,
	useReducedMotion,
} from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

const GAP = 12;
const SNAP_SPRING = { type: "spring", duration: 0.42, bounce: 0.16 } as const;
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
	// Track renders three copies of the cards; `slot` indexes the middle copy so
	// there is always a real card to slide onto in either direction.
	const slotRef = useRef(count);
	const x = useMotionValue(0);
	const [activeIndex, setActiveIndex] = useState(0);
	const [stepWidth, setStepWidth] = useState(0);
	const reduceMotion = useReducedMotion();

	useLayoutEffect(() => {
		const measure = () => {
			const card = containerRef.current
				?.firstElementChild as HTMLElement | null;
			const step = card ? card.offsetWidth + GAP : 0;
			setStepWidth(step);
			slotRef.current = count + wrap(slotRef.current, count);
			x.set(-slotRef.current * step);
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [count, x]);

	// Animate to the target slot, then silently recentre onto the equivalent
	// card in the middle copy so the track never runs out of cards.
	const settle = useCallback(
		(slot: number) => {
			const wrapped = wrap(slot, count);
			slotRef.current = slot;
			setActiveIndex(wrapped);

			const recentre = () => {
				const centred = count + wrapped;
				slotRef.current = centred;
				x.set(-centred * stepWidth);
			};

			if (reduceMotion) {
				recentre();
				return;
			}
			animate(x, -slot * stepWidth, SNAP_SPRING).then(recentre);
		},
		[count, reduceMotion, stepWidth, x],
	);

	const goTo = useCallback(
		(index: number) => {
			const target = wrap(index, count);
			const current = wrap(slotRef.current, count);
			let delta = target - current;
			// Take the shorter way round rather than scrolling back through the middle.
			if (delta > count / 2) delta -= count;
			if (delta < -count / 2) delta += count;
			settle(slotRef.current + delta);
		},
		[count, settle],
	);

	const onDragEnd = useCallback(
		(_event: unknown, info: PanInfo) => {
			if (!stepWidth) return;
			const projected = -x.get() / stepWidth;
			let slot = Math.round(projected);
			if (info.velocity.x < -FLICK_VELOCITY) slot = Math.ceil(projected);
			else if (info.velocity.x > FLICK_VELOCITY) slot = Math.floor(projected);
			const from = slotRef.current;
			slot = Math.max(from - 1, Math.min(from + 1, slot));
			settle(slot);
		},
		[settle, stepWidth, x],
	);

	return { containerRef, x, activeIndex, stepWidth, goTo, onDragEnd };
}
