import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
	LAYOUT_TRANSITION,
	SKELETON_CYCLE_INTERVAL,
	skeletonItemVariants,
} from "@/lib/animations";

interface CyclingSkeletonListProps {
	renderItem: (index: number) => React.ReactNode;
	minItems?: number;
	maxItems?: number;
	interval?: number;
}

/**
 * Renders a list of skeleton items that cycles between min and max count.
 * Items animate in/out with slide-down + fade effect.
 */
export function CyclingSkeletonList({
	renderItem,
	minItems = 1,
	maxItems = 2,
	interval = SKELETON_CYCLE_INTERVAL,
}: CyclingSkeletonListProps) {
	const [itemCount, setItemCount] = useState(minItems);

	useEffect(() => {
		const timer = setInterval(() => {
			setItemCount((prev) => (prev >= maxItems ? minItems : prev + 1));
		}, interval);

		return () => clearInterval(timer);
	}, [minItems, maxItems, interval]);

	return (
		<motion.div
			layout
			transition={{ layout: LAYOUT_TRANSITION }}
			className="flex flex-col gap-3"
		>
			<AnimatePresence mode="popLayout" initial={false}>
				{Array.from({ length: itemCount }).map((_, index) => (
					<motion.div
						key={`skeleton-item-${index}`}
						layout
						variants={skeletonItemVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={{ layout: LAYOUT_TRANSITION }}
					>
						{renderItem(index)}
					</motion.div>
				))}
			</AnimatePresence>
		</motion.div>
	);
}
