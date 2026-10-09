import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "./SidebarContext";
import { SidebarShortcutTooltip } from "./SidebarShortcutTooltip";
import {
	SIDEBAR_HEADER_ICON_BUTTON_CLASS,
	SIDEBAR_ICON_STROKE,
} from "./sidebarRowClass";

/** Collapses the sidebar from the header, or reopens it from the collapsed rail. */
export const SidebarToggleButton = () => {
	const { expanded, setExpanded } = useSidebarContext();
	const label = expanded ? "Collapse sidebar" : "Open sidebar";

	return (
		<SidebarShortcutTooltip
			label={label}
			shortcutKey="B"
			side={expanded ? "bottom" : "right"}
		>
			<button
				type="button"
				aria-label={label}
				onClick={() => setExpanded((prev) => !prev)}
				className={cn(SIDEBAR_HEADER_ICON_BUTTON_CLASS, !expanded && "size-8")}
			>
				<PanelLeft
					className={expanded ? "size-[15px]" : "size-4"}
					strokeWidth={SIDEBAR_ICON_STROKE}
				/>
			</button>
		</SidebarShortcutTooltip>
	);
};
