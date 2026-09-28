import { SwitchSizeProvider } from "@autumn/ui";
import type { ReactNode } from "react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { ConfigRowLayoutProvider } from "./ConfigRowLayoutContext";

/** Tray surface whose ConfigRows render as table rows with compact switches. */
export function AdvancedTray({ children }: { children: ReactNode }) {
	return (
		<div className={TABLE_TRAY_CLASS}>
			<div className={TABLE_TRAY_SURFACE_CLASS}>
				<ConfigRowLayoutProvider layout="tray">
					<SwitchSizeProvider size="sm">{children}</SwitchSizeProvider>
				</ConfigRowLayoutProvider>
			</div>
		</div>
	);
}
