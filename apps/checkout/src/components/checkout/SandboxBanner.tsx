import { ArrowRightIcon, FlaskIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";

export function SandboxBanner() {
	return (
		<div className="w-full h-10 text-sm flex items-center justify-between px-8 text-sandbox border-b border-sandbox/20 rounded-t-2xl relative overflow-hidden">
			{/* Top-right diagonal gradient */}
			<motion.div
				className="absolute inset-0 pointer-events-none bg-[linear-gradient(135deg,color-mix(in_oklch,var(--sandbox)_15%,var(--background))_0%,transparent_60%)]"
				aria-hidden="true"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.4 }}
			/>
			{/* Bottom-left diagonal gradient */}
			<motion.div
				className="absolute inset-0 pointer-events-none bg-[linear-gradient(315deg,color-mix(in_oklch,var(--sandbox)_10%,var(--background))_0%,transparent_50%)]"
				aria-hidden="true"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.4, delay: 0.1 }}
			/>
			{/* Left content */}
			<div className="relative z-10 flex items-center gap-1">
				<FlaskIcon className="h-4 w-4" weight="fill" />
				<p className="tracking-tight">Sandbox</p>
			</div>
			{/* Right link */}
			<a
				href="https://docs.useautumn.com"
				target="_blank"
				rel="noopener noreferrer"
				className="relative z-10 flex items-center gap-2 transition-all group"
			>
				<span className="group-hover:text-foreground transition-all duration-300 tracking-tight">View docs</span>
				<ArrowRightIcon className="h-3.5 w-3.5 group-hover:text-foreground transition-transform duration-300 group-hover:-rotate-45" weight="bold" />
			</a>
		</div>
	);
}
