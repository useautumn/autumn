import type { ReactNode } from "react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";

/** "Rate card" heading, then the rows in the dashboard's tray style. */
export function RateCardTable({
	subtitle,
	action,
	footer,
	children,
}: {
	subtitle: string;
	action?: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2.5">
			<div className="flex items-end justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="font-medium text-foreground text-sm">Rate card</span>
					<span className="truncate text-tertiary-foreground text-xs">
						{subtitle}
					</span>
				</div>
				{action}
			</div>
			<div className={TABLE_TRAY_CLASS}>
				<div className="flex h-7 items-center justify-between px-3 text-tertiary-foreground text-xs">
					<span>Feature</span>
					<span>Credits per use</span>
				</div>
				<ul className={TABLE_TRAY_SURFACE_CLASS}>{children}</ul>
			</div>
			{footer}
		</div>
	);
}
