import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Content beside the rail's gutter, so every row lines up whether or not it has a dot. */
export function PhaseTimelineRow({
	showsRail,
	rail,
	className,
	children,
}: {
	showsRail: boolean;
	rail?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("flex gap-3", className)}>
			{showsRail && <div className="relative w-2 shrink-0">{rail}</div>}
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
