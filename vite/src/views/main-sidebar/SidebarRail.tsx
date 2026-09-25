import * as React from "react";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "./SidebarContext";

export const SidebarRail = React.forwardRef<
	HTMLButtonElement,
	React.ComponentProps<"button">
>(({ className, ...props }, ref) => {
	const { setExpanded } = useSidebarContext();

	const toggleSidebar = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.currentTarget.blur();
		setExpanded((prev: boolean) => !prev);
	};

	return (
		<button
			ref={ref}
			type="button"
			data-sidebar="rail"
			aria-label="Toggle Sidebar"
			tabIndex={-1}
			onClick={toggleSidebar}
			title="Toggle Sidebar"
			className={cn(
				// Base positioning and dimensions
				"absolute z-20 flex w-4 transition-all duration-150 ease-linear",
				// Rounded corners on the right side only
				"rounded-r-full",
				// Vertical positioning with gaps from top and bottom
				"top-5 bottom-5",
				// Positioning at right edge of sidebar - positioned to overlap the edge
				"right-0 translate-x-1/2",
				// Cursor style
				"cursor-w-resize",
				// Visual indicator line using ::after pseudo-element - spans full height
				"after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2",
				"after:w-[2px]",
				"hover:after:bg-border",
				// Hover background
				"hover:bg-border/10",
				"outline-none focus-visible:after:bg-border",
				className,
			)}
			{...props}
		/>
	);
});

SidebarRail.displayName = "SidebarRail";
