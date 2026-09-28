import { CaretRightIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";

export function MoreEntitiesButton({
	count,
	...props
}: ComponentProps<"button"> & { count: number }) {
	return (
		<button
			type="button"
			{...props}
			className="flex h-5.5 shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-foreground/10 pr-1.5 pl-2 text-[11.5px] font-medium text-tertiary-foreground transition-colors hover:text-foreground data-popup-open:border-foreground/15 data-popup-open:bg-foreground/10 data-popup-open:text-foreground"
		>
			{count} more
			<CaretRightIcon size={11} />
		</button>
	);
}
