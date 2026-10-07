import type { Variants } from "motion/react";

export const SHEET_EASE = [0.32, 0.72, 0, 1] as const;

export const SHEET_ANIMATION = {
	duration: 0.3,
	ease: SHEET_EASE,
} as const;

const EXPAND_TRANSITION = { duration: 0.2, ease: SHEET_EASE } as const;

/** Height + crossfade for expanding content; pass `custom={reduceMotion}` to snap the height. */
export const COLLAPSE_VARIANTS = {
	open: (reduceMotion?: boolean) => ({
		height: "auto",
		opacity: 1,
		transition: {
			height: reduceMotion ? { duration: 0 } : EXPAND_TRANSITION,
			opacity: { duration: 0.15, delay: 0.05 },
		},
	}),
	closed: (reduceMotion?: boolean) => ({
		height: 0,
		opacity: 0,
		transition: reduceMotion
			? { height: { duration: 0 }, opacity: EXPAND_TRANSITION }
			: EXPAND_TRANSITION,
	}),
} satisfies Variants;
