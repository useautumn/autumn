import type { ReactNode } from "react";
import { motion } from "motion/react";
import { BackgroundBeams } from "@/components/bg/background-beams";
import { SLOW_TRANSITION, SPRING_TRANSITION } from "@/lib/animations";

/**
 * Full-screen background wrapper with subtle diagonal gradients from primary color.
 * Includes entrance animation for the content container.
 */
export function CheckoutBackground({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
			{/* Top-right diagonal gradient */}
			<motion.div
				className="absolute inset-0 pointer-events-none bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_8%,var(--background))_0%,transparent_50%)]"
				aria-hidden="true"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.6 }}
			/>
			{/* Bottom-left diagonal gradient (lighter) */}
			<motion.div
				className="absolute inset-0 pointer-events-none bg-[linear-gradient(315deg,color-mix(in_oklch,var(--primary)_6%,var(--background))_0%,transparent_45%)]"
				aria-hidden="true"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.6, delay: 0.1 }}
			/>
			{/* Animated beams */}
			<BackgroundBeams className="absolute inset-0 pointer-events-none opacity-5" />
			{/* Frosted glass content container */}
			<motion.div
				layout
				className="relative z-10 w-fit max-w-6xl m-4 p-8 border border-border rounded-2xl bg-card/50 backdrop-blur-xl"
				initial={{ opacity: 0, y: 10, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{
					// Use spring for layout changes (height/width)
					layout: SPRING_TRANSITION,
					// Use slow transition for initial entrance
					...SLOW_TRANSITION,
				}}
			>
				{children}
			</motion.div>
		</div>
	);
}
