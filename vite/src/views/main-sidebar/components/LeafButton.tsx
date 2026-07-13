import { useIsMobile } from "@autumn/ui";
import { LeafIcon } from "@phosphor-icons/react";
import { useLeafPanelStore } from "@/hooks/stores/useLeafPanelStore";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useSidebarContext } from "@/views/main-sidebar/SidebarContext";

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
			className={cn(
				"cursor-pointer font-medium text-sm flex items-center text-muted-foreground px-2 h-7 rounded-lg w-full hover:text-foreground border border-transparent focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
				open &&
					"border border-border !text-foreground bg-interactive-secondary",
			)}
		>
			<div className="flex items-center gap-2">
				<div className="flex justify-center w-4 h-4 items-center rounded-sm">
					<LeafIcon size={16} weight="fill" />
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
