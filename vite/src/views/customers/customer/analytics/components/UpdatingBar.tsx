import { motion, useReducedMotion } from "motion/react";

/** Thin looping bar across the top of a chart that is refreshing in place. */
export const UpdatingBar = () => {
	const prefersReducedMotion = useReducedMotion();

	return (
		<div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-full bg-muted">
			<motion.div
				className="h-full w-2/5 rounded-full bg-primary"
				initial={{ x: "-100%" }}
				animate={prefersReducedMotion ? { x: "75%" } : { x: "250%" }}
				transition={
					prefersReducedMotion
						? { duration: 0 }
						: {
								duration: 1.4,
								ease: "easeInOut",
								repeat: Number.POSITIVE_INFINITY,
							}
				}
			/>
		</div>
	);
};
