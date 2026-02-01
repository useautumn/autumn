import { type HTMLMotionProps, motion } from "motion/react";
import { forwardRef } from "react";
import { SPRING_TRANSITION } from "@/lib/animations";

type AnimatedLayoutProps = HTMLMotionProps<"div"> & {
	/** Unique ID for layout animations - elements with matching IDs animate between each other */
	layoutId?: string;
};

/**
 * A div that smoothly animates size/position changes.
 * Use matching `layoutId` on skeleton and content components for seamless transitions.
 */
export const AnimatedLayout = forwardRef<HTMLDivElement, AnimatedLayoutProps>(
	({ children, layoutId, transition, ...props }, ref) => (
		<motion.div
			ref={ref}
			layout
			layoutId={layoutId}
			transition={transition ?? SPRING_TRANSITION}
			{...props}
		>
			{children}
		</motion.div>
	),
);
AnimatedLayout.displayName = "AnimatedLayout";

/** Pre-configured animated container for cards with layout animations. */
export const AnimatedCard = forwardRef<HTMLDivElement, AnimatedLayoutProps>(
	({ children, layoutId, transition, ...props }, ref) => (
		<motion.div
			ref={ref}
			layout
			layoutId={layoutId}
			transition={transition ?? SPRING_TRANSITION}
			{...props}
		>
			{children}
		</motion.div>
	),
);
AnimatedCard.displayName = "AnimatedCard";

/**
 * Animated list item that works within AnimatedLayout containers.
 * Automatically participates in layout animations.
 */
export const AnimatedListItem = forwardRef<HTMLDivElement, AnimatedLayoutProps>(
	({ children, transition, ...props }, ref) => (
		<motion.div
			ref={ref}
			layout
			transition={transition ?? SPRING_TRANSITION}
			{...props}
		>
			{children}
		</motion.div>
	),
);
AnimatedListItem.displayName = "AnimatedListItem";
