import type { ReactNode } from "react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";

export const PLAN_TRAY_HEADER_CLASS =
	"flex min-h-9 items-center gap-2 px-2 py-1 text-xs";

/** A tray whose header sits on the tray and whose plan rows sit on the raised surface. */
export function PlanTray({
	header,
	className,
	children,
}: {
	header?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn(TABLE_TRAY_CLASS, className)}>
			{header}
			<div className={TABLE_TRAY_SURFACE_CLASS}>{children}</div>
		</div>
	);
}

export function PlanTrayTitle({
	title,
	hint,
}: {
	title: string;
	hint?: string;
}) {
	return (
		<div className={PLAN_TRAY_HEADER_CLASS}>
			<span className="font-medium text-muted-foreground">{title}</span>
			{hint && (
				<span className="truncate text-tertiary-foreground">{hint}</span>
			)}
		</div>
	);
}
