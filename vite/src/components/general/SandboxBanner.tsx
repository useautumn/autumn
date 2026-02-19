import { FlaskIcon } from "@phosphor-icons/react";

export function SandboxBanner({ children }: { children?: React.ReactNode }) {
	return (
		<div className="w-full min-h-10 h-10 text-sm flex items-center text-sandbox border-b border-sandbox/20 relative overflow-hidden bg-sandbox/10">
			{/* Content container - matches page content alignment */}
			<div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-10 flex items-center justify-between">
				{/* Left content */}
				<div className="flex items-center gap-1">
					<FlaskIcon className="h-4 w-4" weight="fill" />
					<p className="tracking-tight">Sandbox</p>
				</div>
				{/* Right content (optional children) */}
				{children}
			</div>
		</div>
	);
}
