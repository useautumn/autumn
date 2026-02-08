import type { ReactNode } from "react";
import { motion } from "motion/react";
import { BackgroundBeams } from "@/components/bg/background-beams";
import { SandboxBanner } from "@/components/checkout/layout/SandboxBanner";
import { SLOW_TRANSITION, SPRING_TRANSITION } from "@/lib/animations";

interface CheckoutBackgroundProps {
	children: ReactNode;
	isSandbox?: boolean;
}

/**
 * Full-screen background wrapper with subtle diagonal gradients from primary color.
 * Includes entrance animation for the content container.
 */
export function CheckoutBackground({ children, isSandbox }: CheckoutBackgroundProps) {
	return (
		<div className="h-screen bg-background relative overflow-hidden flex items-center justify-center p-8">
			{/* Top-right diagonal gradient */}
			<motion.div
				className="fixed inset-0 pointer-events-none bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_8%,var(--background))_0%,transparent_50%)]"
				aria-hidden="true"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.6 }}
			/>
			{/* Bottom-left diagonal gradient (lighter) */}
			<motion.div
				className="fixed inset-0 pointer-events-none bg-[linear-gradient(315deg,color-mix(in_oklch,var(--primary)_6%,var(--background))_0%,transparent_45%)]"
				aria-hidden="true"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.6, delay: 0.1 }}
			/>
			{/* Animated beams */}
			<BackgroundBeams className="fixed inset-0 pointer-events-none opacity-6" />
			{/* Frosted glass content container */}
			<motion.div
				layout
				className="relative z-10 w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl max-h-full border border-border rounded-2xl bg-card/50 backdrop-blur-xl overflow-auto [scrollbar-width:thin] [scrollbar-color:color-mix(in_oklch,var(--foreground)_20%,transparent)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:bg-transparent [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full"
				initial={{ opacity: 0, y: 10, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{
					// Use spring for layout changes (height/width)
					layout: SPRING_TRANSITION,
					// Use slow transition for initial entrance
					...SLOW_TRANSITION,
				}}
			>
				{/* Sandbox banner - outside padding, inside scrolling container */}
				{isSandbox && <SandboxBanner />}
				{/* Padded content wrapper */}
				<div className="p-8">
					{children}
				</div>
			</motion.div>
		</div>
	);
}
