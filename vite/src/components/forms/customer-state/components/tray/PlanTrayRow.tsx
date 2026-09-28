import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

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
				"flex flex-col gap-1.5",
				!flush && "px-2 py-1.5",
				TABLE_TRAY_SURFACE_ROW_CLASS,
			)}
		>
			{children}
		</div>
	);
}
