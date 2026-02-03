import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { CROSSFADE_TRANSITION, LAYOUT_TRANSITION } from "@/lib/animations";
import { cn } from "@/lib/utils";

interface CrossfadeContainerProps {
	isLoading: boolean;
	skeleton: ReactNode;
	children: ReactNode;
	className?: string;
}

/**
 * Smoothly crossfades between skeleton and content with height animation.
 * Uses popLayout mode for overlapping exit/enter animations.
 */
export function CrossfadeContainer({
	isLoading,
	skeleton,
	children,
	className,
}: CrossfadeContainerProps) {
	return (
		<motion.div
			layout
			transition={{ layout: LAYOUT_TRANSITION }}
			className={cn("relative", className)}
		>
			<AnimatePresence mode="popLayout">
				{isLoading ? (
					<motion.div
						key="skeleton"
						initial={{ opacity: 1 }}
						animate={{ opacity: 1 }}
						exit={{
							opacity: 0,
							transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
						}}
					>
						{skeleton}
					</motion.div>
				) : (
					<motion.div
						key="content"
						initial={{ opacity: 0 }}
						animate={{
							opacity: 1,
							transition: {
								...CROSSFADE_TRANSITION,
								delay: 0.05,
							},
						}}
						exit={{
							opacity: 0,
							transition: { duration: 0.15 },
						}}
					>
						{children}
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
