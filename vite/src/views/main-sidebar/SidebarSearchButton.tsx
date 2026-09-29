import { Search } from "lucide-react";
import { useCommandBarStore } from "@/hooks/stores/useCommandBarStore";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "./SidebarContext";
import { SIDEBAR_HEADER_ICON_BUTTON_CLASS } from "./sidebarRowClass";

export const SidebarSearchButton = () => {
	const { expanded } = useSidebarContext();
	const openCommandBar = useCommandBarStore((state) => state.openCommandBar);

	return (
		<button
			aria-label="Search"
			title="Search (⌘K)"
			className={cn(
				expanded
					? SIDEBAR_HEADER_ICON_BUTTON_CLASS
					: "flex size-8 shrink-0 items-center justify-center rounded-lg bg-interactive-secondary text-[#8A8A8A] outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring dark:bg-[#1A1A1A] dark:text-[#7A7A7A] dark:hover:text-[#A1A1A1]",
			)}
			onClick={openCommandBar}
			type="button"
		>
			<Search className="size-3.5 shrink-0" strokeWidth={1.75} />
		</button>
	);
};
