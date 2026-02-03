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

/** Skeleton cycling configuration */
export const SKELETON_CYCLE_INTERVAL = 1200; // ms between state changes (1 item -> 2 items -> 1 item)
export const SKELETON_ITEM_DURATION = 0.25; // seconds for enter/exit animations

/** Skeleton item slide-down + fade animation */
export const skeletonItemVariants: Variants = {
	initial: { opacity: 0, y: -10 },
	animate: {
		opacity: 1,
		y: 0,
		transition: {
			duration: SKELETON_ITEM_DURATION,
			ease: [0.4, 0, 0.2, 1],
		},
	},
	exit: {
		opacity: 0,
		y: 5,
		transition: {
			duration: SKELETON_ITEM_DURATION * 0.8,
			ease: [0.4, 0, 1, 1],
		},
	},
};

/** Gentle spring for success animations */
export const GENTLE_SPRING: Transition = {
	type: "spring",
	stiffness: 300,
	damping: 25,
	mass: 1,
};

/** Stagger settings for list animations */
export const STAGGER_CHILDREN = {
	staggerChildren: 0.05,
	delayChildren: 0.08,
};

/** Faster stagger for smaller lists */
export const FAST_STAGGER = {
	staggerChildren: 0.03,
	delayChildren: 0.05,
};

// ============================================
// Variant Presets
// ============================================

/** Simple fade in/out */
export const fadeVariants: Variants = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

/** Fade with upward slide (8px) */
export const fadeUpVariants: Variants = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -4 },
};

/** Fade with downward slide */
export const fadeDownVariants: Variants = {
	initial: { opacity: 0, y: -8 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: 4 },
};

/** Scale with fade (for modals, success states) */
export const scaleVariants: Variants = {
	initial: { opacity: 0, scale: 0.95 },
	animate: { opacity: 1, scale: 1 },
	exit: { opacity: 0, scale: 0.98 },
};

/** Larger scale animation for celebration effects */
export const celebrateVariants: Variants = {
	initial: { opacity: 0, scale: 0.8 },
	animate: { opacity: 1, scale: 1 },
	exit: { opacity: 0, scale: 0.9 },
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

/** Fast container variant for smaller lists */
export const fastListContainerVariants: Variants = {
	initial: { opacity: 0 },
	animate: {
		opacity: 1,
		transition: FAST_STAGGER,
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

/** Skeleton shimmer variant */
export const skeletonVariants: Variants = {
	initial: { opacity: 0 },
	animate: {
		opacity: 1,
		transition: { duration: 0.2 },
	},
	exit: {
		opacity: 0,
		transition: { duration: 0.15 },
	},
};

/** Number counter direction variants */
export const numberUpVariants: Variants = {
	initial: { opacity: 0, y: 10 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -10 },
};

export const numberDownVariants: Variants = {
	initial: { opacity: 0, y: -10 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: 10 },
};

/** Button press animation */
export const buttonPressVariants: Variants = {
	idle: { scale: 1 },
	pressed: { scale: 0.98 },
};

/** Card hover animation */
export const cardHoverVariants: Variants = {
	idle: { scale: 1 },
	hovered: { scale: 1.01 },
};

/** Checkmark draw animation */
export const checkmarkVariants: Variants = {
	initial: { pathLength: 0, opacity: 0 },
	animate: {
		pathLength: 1,
		opacity: 1,
		transition: {
			pathLength: { duration: 0.3, ease: "easeOut" },
			opacity: { duration: 0.1 },
		},
	},
};

/** Width expansion (for separators, progress bars) */
export const widthExpandVariants: Variants = {
	initial: { scaleX: 0, originX: 0 },
	animate: {
		scaleX: 1,
		transition: STANDARD_TRANSITION,
	},
};

/** Height collapse/expand */
export const collapseVariants: Variants = {
	initial: { height: 0, opacity: 0 },
	animate: {
		height: "auto",
		opacity: 1,
		transition: {
			height: STANDARD_TRANSITION,
			opacity: { duration: 0.2, delay: 0.1 },
		},
	},
	exit: {
		height: 0,
		opacity: 0,
		transition: {
			height: STANDARD_TRANSITION,
			opacity: { duration: 0.1 },
		},
	},
};

// ============================================
// Helper functions
// ============================================

/** Creates a delayed variant */
export function withDelay<T extends Variants>(
	variants: T,
	delay: number,
): Variants {
	return {
		...variants,
		animate: {
			...(typeof variants.animate === "object" ? variants.animate : {}),
			transition: {
				...((typeof variants.animate === "object" &&
				"transition" in variants.animate
					? variants.animate.transition
					: {}) as object),
				delay,
			},
		},
	};
}

/** Creates transition with custom duration */
export function withDuration(duration: number): Transition {
	return {
		duration,
		ease: [0.32, 0.72, 0, 1],
	};
}
