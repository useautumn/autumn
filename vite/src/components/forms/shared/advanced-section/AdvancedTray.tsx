import type { ReactNode } from "react";
import { TABLE_TRAY_CLASS } from "@/components/general/table";
import { AdvancedTraySurface } from "./AdvancedTraySurface";

export function AdvancedTray({ children }: { children: ReactNode }) {
	return (
		<div className={TABLE_TRAY_CLASS}>
			<AdvancedTraySurface>{children}</AdvancedTraySurface>
		</div>
	);
}
