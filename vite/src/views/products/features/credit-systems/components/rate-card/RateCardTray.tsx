import type { ReactNode } from "react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";

/** The rate card in the dashboard's tray style: column headings on the tray, rows on the raised surface. */
export function RateCardTray({ children }: { children: ReactNode }) {
	return (
		<div className={TABLE_TRAY_CLASS}>
			<div className="flex h-7 items-center justify-between px-3 text-tertiary-foreground text-xs">
				<span>Feature</span>
				<span>Credits per use</span>
			</div>
			<ul className={TABLE_TRAY_SURFACE_CLASS}>{children}</ul>
		</div>
	);
}
