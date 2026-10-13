import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Search row for hand-built popovers, matching the Command search row. */
export const OverlaySearchInput = ({
	icon = <MagnifyingGlassIcon className="size-3.5 shrink-0" />,
	className,
	...props
}: ComponentProps<"input"> & { icon?: ReactNode }) => (
	<label
		className={cn(
			"flex h-9 shrink-0 items-center gap-2 border-b border-overlay-separator px-3 text-tertiary-foreground",
			className,
		)}
	>
		{icon}
		<input
			type="text"
			className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-hidden placeholder:text-tertiary-foreground disabled:cursor-not-allowed"
			{...props}
		/>
	</label>
);
