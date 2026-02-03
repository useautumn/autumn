import type { Transition, Variants } from "motion/react";

/**
 * Core transition presets following Linear-style timing.
 * Uses custom ease-out curve [0.32, 0.72, 0, 1] for snappy, professional feel.
 */

/** Fast transition for micro-interactions (150ms) */
export const FAST_TRANSITION: Transition = {
	duration: 0.15,
	ease: [0.32, 0.72, 0, 1],
};

/** Standard transition for most UI elements (250ms) */
export const STANDARD_TRANSITION: Transition = {
	duration: 0.25,
	ease: [0.32, 0.72, 0, 1],
};

/** Slower transition for larger elements (350ms) */
export const SLOW_TRANSITION: Transition = {
	duration: 0.35,
	ease: [0.32, 0.72, 0, 1],
};

/** Spring transition for bouncy, organic feel */
export const SPRING_TRANSITION: Transition = {
	type: "spring",
	stiffness: 500,
	damping: 40,
	mass: 1,
};

/** Gentle layout transition for skeleton-to-content morphing and height changes */
export const LAYOUT_TRANSITION: Transition = {
	type: "spring",
	stiffness: 150,
	damping: 25,
	mass: 1,
};

/** Crossfade transition for skeleton/content swaps */
export const CROSSFADE_TRANSITION: Transition = {
	duration: 0.3,
	ease: [0.4, 0, 0.2, 1],
};

/** Gentle spring for success animations */
export const GENTLE_SPRING: Transition = {
	type: "spring",
	stiffness: 300,
	damping: 25,
	mass: 1,
};

/** Stagger settings for list animations */
const STAGGER_CHILDREN = {
	staggerChildren: 0.05,
	delayChildren: 0.08,
};

/** Fade with upward slide (8px) */
export const fadeUpVariants: Variants = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -4 },
};

/** Container variant with staggered children */
export const listContainerVariants: Variants = {
	initial: { opacity: 0 },
	animate: {
		opacity: 1,
		transition: STAGGER_CHILDREN,
	},
	exit: { opacity: 0 },
};

/** List item variant (used with container) */
export const listItemVariants: Variants = {
	initial: { opacity: 0, y: 10 },
	animate: {
		opacity: 1,
		y: 0,
		transition: STANDARD_TRANSITION,
	},
	exit: {
		opacity: 0,
		y: -5,
		transition: FAST_TRANSITION,
	},
};
