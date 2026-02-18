import type { Transition, Variants } from "motion/react";

export const FAST_TRANSITION: Transition = {
	duration: 0.25,
	ease: [0.32, 0.72, 0, 1],
};

export const LAYOUT_TRANSITION: Transition = {
	duration: 0.5,
	ease: [0.32, 0.72, 0, 1],
};

export const COLLAPSE_TRANSITION: Transition = {
	duration: 0.5,
	ease: [0.32, 0.72, 0, 1],
};

export const STAGGER_CONTAINER: Variants = {
	hidden: {},
	visible: {
		transition: { staggerChildren: 0.06 },
	},
};

export const STAGGER_ITEM: Variants = {
	hidden: { opacity: 0, y: 8 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
	},
};

/** Opacity-only stagger item for elements using layout="position" — avoids y transform conflicts with layout animations */
export const STAGGER_ITEM_LAYOUT: Variants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
	},
};

export const STAGGER_ITEM_DELAYED: Variants = {
	hidden: { opacity: 0, y: 8 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1], delay: 0.15 },
	},
};
