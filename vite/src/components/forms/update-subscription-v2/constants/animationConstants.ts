import type { Transition } from "motion/react";

export const FAST_TRANSITION: Transition = {
	duration: 0.1,
	ease: [0.32, 0.72, 0, 1],
};

export const TRANSITION: Transition = {
	duration: 0.2,
	ease: [0.32, 0.72, 0, 1],
};

export const LAYOUT_TRANSITION: Transition = {
	duration: 0.35,
	ease: [0.32, 0.72, 0, 1],
};
