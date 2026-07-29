import { useIsMobile } from "@autumn/ui";
import { TerminalWindowIcon } from "@phosphor-icons/react";
import { useMatch } from "react-router";
import { useWorkbenchStore } from "@/hooks/stores/useWorkbenchStore";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useSidebarContext } from "@/views/main-sidebar/SidebarContext";

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
			className={cn(
				"cursor-pointer font-medium text-sm flex items-center text-muted-foreground px-2 h-7 rounded-lg w-full hover:text-foreground border border-transparent focus:outline-none focus-visible:outline-none",
				isOpen &&
					"border border-border !text-foreground bg-interactive-secondary",
			)}
		>
			<div className="flex items-center gap-2">
				<div className="flex justify-center w-4 h-4 items-center rounded-sm">
					<TerminalWindowIcon size={16} weight="duotone" />
				</div>
				<span
					className={cn(
						"whitespace-nowrap",
						expanded
							? "opacity-100 translate-x-0"
							: "opacity-0 -translate-x-2 pointer-events-none w-0 m-0 p-0",
					)}
				>
					Workbench
				</span>
			</div>
		</button>
	);
};
