import { CaretRightIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { SCOPE_TAB_CLASS } from "./ScopeTab";

export function MoreEntitiesButton({
	count,
	...props
}: ComponentProps<"button"> & { count: number }) {
	return (
		<button
			type="button"
			{...props}
			className={cn(
				SCOPE_TAB_CLASS,
				"gap-1 border-foreground/10 pr-1.5 pl-2 text-tertiary-foreground hover:text-foreground data-popup-open:border-foreground/15 data-popup-open:bg-foreground/10 data-popup-open:text-foreground",
			)}
		>
			{count} more
			<CaretRightIcon size={11} />
		</button>
	);
}
