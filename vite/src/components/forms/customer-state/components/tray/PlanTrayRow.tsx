import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

/** One surface row; anything under the plan line (quantities) stays inside its divider. */
export function PlanTrayRow({
	dimmed = false,
	children,
}: {
	dimmed?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 px-2 py-1.5",
				TABLE_TRAY_SURFACE_ROW_CLASS,
				dimmed && "opacity-60",
			)}
		>
			{children}
		</div>
	);
}
