import { useIsMobile } from "@autumn/ui";
import { SquareTerminal } from "lucide-react";
import { useMatch } from "react-router";
import { useWorkbenchStore } from "@/hooks/stores/useWorkbenchStore";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useSidebarContext } from "@/views/main-sidebar/SidebarContext";
import {
	sidebarIconClass,
	sidebarRowClass,
	sidebarRowContentClass,
} from "@/views/main-sidebar/sidebarRowClass";

export const WorkbenchButton = () => {
	const { isAdmin } = useAdmin();
	const onCustomerView = useMatch("/customers/:customer_id");
	const onCustomerSubView = useMatch("/customers/:customer_id/*");
	const isMobile = useIsMobile();
	const { expanded } = useSidebarContext();

	const toggle = useWorkbenchStore((s) => s.toggle);
	const isOpen = useWorkbenchStore((s) => s.isOpen);

	if (!isAdmin || isMobile || (!onCustomerView && !onCustomerSubView)) {
		return null;
	}

	return (
		<button
			type="button"
			onClick={(e) => {
				e.currentTarget.blur();
				toggle();
			}}
			className={sidebarRowClass({
				isActive: isOpen,
				isCollapsed: !expanded,
			})}
		>
			<div className={sidebarRowContentClass({ isCollapsed: !expanded })}>
				<div className={sidebarIconClass({ isActive: isOpen })}>
					<SquareTerminal strokeWidth={1.5} />
				</div>
				{expanded && (
					<span className="truncate whitespace-nowrap">Workbench</span>
				)}
			</div>
		</button>
	);
};
