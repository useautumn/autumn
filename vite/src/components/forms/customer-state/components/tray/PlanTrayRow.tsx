import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const PLAN_TRAY_ROW_DIVIDER_CLASS =
	"border-t border-table-row-divider first:border-t-0 hover:bg-table-row-hover";

/** One surface row; `flush` rows let a full-bleed control own the padding. */
export function PlanTrayRow({
	flush = false,
	children,
}: {
	flush?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 animate-in fade-in-0 duration-150 ease-out motion-reduce:animate-none",
				!flush && "px-2 py-1",
				PLAN_TRAY_ROW_DIVIDER_CLASS,
			)}
		>
			{children}
		</div>
	);
}
