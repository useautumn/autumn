import type { Transition, Variants } from "motion/react";

export const FAST_TRANSITION: Transition = {
	duration: 0.15,
	ease: [0.32, 0.72, 0, 1],
};

export const STANDARD_TRANSITION: Transition = {
	duration: 0.25,
	ease: [0.32, 0.72, 0, 1],
};

export const SLOW_TRANSITION: Transition = {
	duration: 0.35,
	ease: [0.32, 0.72, 0, 1],
};

export const SPRING_TRANSITION: Transition = {
	type: "spring",
	stiffness: 500,
	damping: 40,
	mass: 1,
};

export const LAYOUT_TRANSITION: Transition = {
	type: "spring",
	stiffness: 150,
	damping: 25,
	mass: 1,
};

export const CROSSFADE_TRANSITION: Transition = {
	duration: 0.3,
	ease: [0.4, 0, 0.2, 1],
};

export const GENTLE_SPRING: Transition = {
	type: "spring",
	stiffness: 300,
	damping: 25,
	mass: 1,
};

const STAGGER_CHILDREN = {
	staggerChildren: 0.05,
	delayChildren: 0.08,
};

export const fadeUpVariants: Variants = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -4 },
};

export const listContainerVariants: Variants = {
	initial: { opacity: 0 },
	animate: {
		opacity: 1,
		transition: STAGGER_CHILDREN,
	},
	exit: { opacity: 0 },
};

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
