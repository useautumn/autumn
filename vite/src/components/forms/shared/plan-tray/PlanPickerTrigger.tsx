import { PlusIcon } from "@phosphor-icons/react";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

export function PlanPickerTrigger(props: ComponentProps<"button">) {
	return (
		<button
			type="button"
			{...props}
			className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 px-2 text-left text-sm text-tertiary-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground disabled:cursor-not-allowed data-popup-open:text-foreground"
		>
			<PlusIcon size={12} className="shrink-0" />
			<span className="min-w-0 flex-1 truncate">Select a plan…</span>
			<ChevronDownIcon className="size-4 shrink-0 opacity-50" />
		</button>
	);
}
