import { motion, useReducedMotion } from "motion/react";

const SWEEP = {
	duration: 1.6,
	ease: "easeInOut",
	repeat: Number.POSITIVE_INFINITY,
} as const;

/** One soft highlight crossing a row of loading stubs; its parent clips it and sets the height. */
export const StubSweep = () => {
	const prefersReducedMotion = useReducedMotion();
	if (prefersReducedMotion) return null;

	// x is a share of the band's own width: -100% starts it off the left edge, 400% clears the right.
	return (
		<motion.div
			className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
			initial={{ x: "-100%" }}
			animate={{ x: "400%" }}
			transition={SWEEP}
		/>
	);
};
