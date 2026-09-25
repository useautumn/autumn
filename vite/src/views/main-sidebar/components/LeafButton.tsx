import { useIsMobile } from "@autumn/ui";
import { Leaf } from "lucide-react";
import { useLeafPanelStore } from "@/hooks/stores/useLeafPanelStore";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useSidebarContext } from "@/views/main-sidebar/SidebarContext";
import {
	sidebarIconClass,
	sidebarRowClass,
	sidebarRowContentClass,
} from "@/views/main-sidebar/sidebarRowClass";

export const LeafButton = () => {
	const { isAdmin } = useAdmin();
	const isMobile = useIsMobile();
	const { expanded } = useSidebarContext();

	const togglePanel = useLeafPanelStore((s) => s.togglePanel);
	const open = useLeafPanelStore((s) => s.open);

	if (!isAdmin || isMobile) {
		return null;
	}

	return (
		<button
			type="button"
			onClick={(e) => {
				e.currentTarget.blur();
				togglePanel();
			}}
			className={sidebarRowClass({
				isActive: open,
				isCollapsed: !expanded,
			})}
		>
			<div className={sidebarRowContentClass({ isCollapsed: !expanded })}>
				<div className={sidebarIconClass({ isActive: open })}>
					<Leaf strokeWidth={1.5} />
				</div>
				{expanded && <span className="truncate whitespace-nowrap">Leaf</span>}
			</div>
		</button>
	);
};
