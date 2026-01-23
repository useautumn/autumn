import type { Transition } from "motion/react";

export const FAST_TRANSITION: Transition = {
	duration: 0.25,
	ease: [0.32, 0.72, 0, 1],
};

export const TRANSITION: Transition = {
	duration: 0.4,
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
