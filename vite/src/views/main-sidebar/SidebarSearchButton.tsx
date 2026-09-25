import { Search } from "lucide-react";
import { useCommandBarStore } from "@/hooks/stores/useCommandBarStore";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "./SidebarContext";

export const SidebarSearchButton = () => {
	const { expanded } = useSidebarContext();
	const openCommandBar = useCommandBarStore((state) => state.openCommandBar);

	return (
		<button
			aria-label="Search"
			className={cn(
				"flex h-[30px] w-full shrink-0 items-center gap-2 rounded-lg bg-interactive-secondary text-[13px] font-[450] leading-4 text-[#8A8A8A] outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring dark:bg-[#1A1A1A] dark:text-[#7A7A7A] dark:hover:text-[#A1A1A1]",
				expanded ? "px-2.5" : "justify-center px-0",
			)}
			onClick={openCommandBar}
			type="button"
		>
			<Search className="size-3.5 shrink-0" strokeWidth={1.75} />
			{expanded && (
				<>
					<span className="flex-1 text-left">Search</span>
					<kbd className="rounded bg-muted px-[5px] py-px font-sans text-[11px] font-medium leading-[14px] dark:bg-[#262626]">
						⌘K
					</kbd>
				</>
			)}
		</button>
	);
};
