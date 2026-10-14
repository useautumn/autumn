import { motion, useReducedMotion } from "motion/react";

const SWEEP = {
	duration: 1.6,
	ease: "easeInOut",
	repeat: Number.POSITIVE_INFINITY,
} as const;

export const StubSweep = () => {
	const prefersReducedMotion = useReducedMotion();
	if (prefersReducedMotion) return null;

	return (
		<motion.div
			className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
			initial={{ x: "-100%" }}
			animate={{ x: "400%" }}
			transition={SWEEP}
		/>
	);
};
