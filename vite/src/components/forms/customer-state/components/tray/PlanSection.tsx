import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";

export const PLAN_SECTION_HEADER_CLASS =
	"flex min-h-8 items-center gap-2 text-xs";

/** A header sitting on the sheet above one raised surface of plan rows. */
export function PlanSection({
	header,
	children,
}: {
	header?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			{header}
			<div className={TABLE_TRAY_SURFACE_CLASS}>{children}</div>
		</div>
	);
}
