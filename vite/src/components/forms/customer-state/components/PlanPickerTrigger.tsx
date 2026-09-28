import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

/** Full-bleed row trigger, so the popover anchors to the whole row. */
export function PlanPickerTrigger(props: ComponentProps<"button">) {
	return (
		<button
			type="button"
			{...props}
			className="flex min-h-9 w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-left text-sm text-tertiary-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground disabled:cursor-not-allowed data-popup-open:text-foreground"
		>
			<span className="min-w-0 flex-1 truncate">Select a plan…</span>
			<ChevronDownIcon className="size-4 shrink-0 opacity-50" />
		</button>
	);
}
