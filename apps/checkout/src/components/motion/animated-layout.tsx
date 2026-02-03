import { type HTMLMotionProps, motion } from "motion/react";
import { forwardRef } from "react";
import { LAYOUT_TRANSITION } from "@/lib/animations";

type AnimatedLayoutProps = HTMLMotionProps<"div"> & {
	/** Unique ID for layout animations - elements with matching IDs animate between each other */
	layoutId?: string;
};

/**
 * A div that smoothly animates size/position changes.
 * Uses a gentle spring transition optimized for skeleton-to-content morphing.
 */
export const AnimatedLayout = forwardRef<HTMLDivElement, AnimatedLayoutProps>(
	({ children, layoutId, transition, ...props }, ref) => (
		<motion.div
			ref={ref}
			layout
			layoutId={layoutId}
			transition={{
				layout: LAYOUT_TRANSITION,
				...transition,
			}}
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
			transition={{
				layout: LAYOUT_TRANSITION,
				...transition,
			}}
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
			transition={{
				layout: LAYOUT_TRANSITION,
				...transition,
			}}
			{...props}
		>
			{children}
		</motion.div>
	),
);
AnimatedListItem.displayName = "AnimatedListItem";
