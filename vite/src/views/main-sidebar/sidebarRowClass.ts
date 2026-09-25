import { cn } from "@/lib/utils";

/** Shared look for every sidebar row (dark values mirror the Paper 08e sidebar exactly). */
export const sidebarRowClass = ({
	isActive = false,
}: {
	isActive?: boolean;
} = {}) =>
	cn(
		"group/row flex h-[30px] w-full shrink-0 cursor-pointer items-center rounded-md px-2.5 text-[13px] font-[450] leading-4 outline-none transition-colors duration-150 ease-out focus-visible:bg-black/[0.05] dark:focus-visible:bg-white/[0.06]",
		isActive
			? "bg-black/[0.06] text-foreground dark:bg-white/[0.08] dark:text-[#F5F5F5]"
			: "text-[#555555] hover:bg-black/[0.03] hover:text-foreground dark:text-[#A1A1A1] dark:hover:bg-white/[0.04] dark:hover:text-[#F5F5F5]",
	);

export const sidebarIconClass = ({
	isActive = false,
}: {
	isActive?: boolean;
} = {}) =>
	cn(
		"flex size-4 shrink-0 items-center justify-center transition-colors duration-150 ease-out [&_svg]:size-4",
		isActive
			? "text-foreground dark:text-[#EDEDED]"
			: "text-[#8A8A8A] group-hover/row:text-foreground dark:text-[#7A7A7A] dark:group-hover/row:text-[#EDEDED]",
	);

export const SIDEBAR_ICON_STROKE = 1.5;
