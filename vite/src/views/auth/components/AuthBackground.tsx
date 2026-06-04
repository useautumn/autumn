import type { ReactNode } from "react";
import { AutumnWordmark } from "./AutumnWordmark";

interface AuthBackgroundProps {
	children: ReactNode;
}

/**
 * Split-screen auth layout: image panel on left, content on right.
 * Clean border separation. Image hidden on mobile.
 */
export function AuthBackground({ children }: AuthBackgroundProps) {
	return (
		<div className="h-screen bg-background flex">
			{/* Image panel */}
			<div className="hidden lg:block relative w-1/2 overflow-hidden border-r border-border bg-[#0a0a0a]">
				<img
					src="/auth-hero.avif"
					alt=""
					aria-hidden="true"
					className="absolute inset-0 w-full h-full object-cover"
				/>
				<div className="absolute inset-0 dark:bg-black/50" aria-hidden="true" />
				<div className="absolute inset-0 flex items-end p-8">
					<AutumnWordmark className="h-7 w-auto text-white/80" />
				</div>
			</div>

			{/* Form panel */}
			<div className="w-full lg:w-1/2 flex items-center justify-center p-6">
				<div className="w-full max-w-[350px]">{children}</div>
			</div>
		</div>
	);
}
