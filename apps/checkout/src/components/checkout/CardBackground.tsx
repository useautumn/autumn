import type { ReactNode } from "react";
import { motion } from "motion/react";

/**
 * Full-screen background wrapper with subtle diagonal gradients from primary color.
 * Includes entrance animation for the content container.
 */
export function CardBackground({ children }: { children: ReactNode }) {
	return (
		<div className="bg-card relative overflow-hidden">
			{/* Top-right diagonal gradient */}
			<motion.div
				className="absolute inset-0 pointer-events-none bg-[linear-gradient(135deg,color-mix(in_oklch,var(--foreground)_4%,var(--background))_0%,transparent_50%)]"
				aria-hidden="true"
				initial={{ opacity: 0 }}
				animate={{ opacity: 0.4 }}
				transition={{ duration: 0.6 }}
			/>
			{/* Bottom-left diagonal gradient (lighter) */}
			<motion.div
				className="absolute inset-0 pointer-events-none bg-[linear-gradient(315deg,color-mix(in_oklch,var(--foreground)_2%,var(--background))_0%,transparent_45%)]"
				aria-hidden="true"
				initial={{ opacity: 0 }}
				animate={{ opacity: 0.2 }}
				transition={{ duration: 0.6, delay: 0.1 }}
			/>
			<div className="relative z-10">
				{children}
			</div>
		</div>
	);
}
