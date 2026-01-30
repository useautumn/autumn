import type { ReactNode } from "react";
import { BackgroundBeams } from "@/components/bg/background-beams";

/**
 * Full-screen background wrapper with subtle diagonal gradients from primary color.
 */
export function CheckoutBackground({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
			{/* Top-right diagonal gradient */}
			<div className="absolute inset-0 pointer-events-none bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_8%,var(--background))_0%,transparent_50%)]"
				aria-hidden="true"
			/>
			{/* Bottom-left diagonal gradient (lighter) */}
			<div
				className="absolute inset-0 pointer-events-none bg-[linear-gradient(315deg,color-mix(in_oklch,var(--primary)_6%,var(--background))_0%,transparent_45%)]"
				aria-hidden="true"
			/>
			{/* Animated beams */}
			<BackgroundBeams className="absolute inset-0 pointer-events-none opacity-5" />
			{/* Frosted glass content container */}
			<div className="relative z-10 w-fit max-w-6xl m-4 p-8 border border-border rounded-2xl bg-card/50 backdrop-blur-xl">
				{children}
			</div>
		</div>
	);
}
