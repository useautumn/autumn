import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@autumn/ui";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

/** Extra option rows folded into the bottom of the same tray surface. */
export function AdvancedMoreOptions({ children }: { children: ReactNode }) {
	return (
		<Collapsible>
			<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 [&>*:last-child]:border-b">
				{children}
			</CollapsibleContent>
			<CollapsibleTrigger
				className={cn(
					"group/more-options flex min-h-10 w-full cursor-pointer items-center gap-3 px-3 text-left text-sm text-tertiary-foreground transition-colors hover:text-foreground",
					TABLE_TRAY_SURFACE_ROW_CLASS,
				)}
			>
				<span className="flex-1 group-data-panel-open/more-options:hidden">
					More options
				</span>
				<span className="hidden flex-1 group-data-panel-open/more-options:inline">
					Fewer options
				</span>
				<ChevronDownIcon className="size-4 shrink-0 transition-transform duration-200 group-data-panel-open/more-options:rotate-180" />
			</CollapsibleTrigger>
		</Collapsible>
	);
}
