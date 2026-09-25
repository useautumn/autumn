import { useIsMobile } from "@autumn/ui";
import { Leaf } from "lucide-react";
import { useLeafPanelStore } from "@/hooks/stores/useLeafPanelStore";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useSidebarContext } from "@/views/main-sidebar/SidebarContext";
import {
	sidebarIconClass,
	sidebarRowClass,
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
			className={sidebarRowClass({ isActive: open })}
		>
			<div className="flex min-w-0 flex-1 items-center gap-2.5">
				<div className={sidebarIconClass({ isActive: open })}>
					<Leaf strokeWidth={1.5} />
				</div>
				<span
					className={cn(
						"whitespace-nowrap",
						expanded
							? "opacity-100 translate-x-0"
							: "opacity-0 -translate-x-2 pointer-events-none w-0 m-0 p-0",
					)}
				>
					Leaf
				</span>
			</div>
		</button>
	);
};
