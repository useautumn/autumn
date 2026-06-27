import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { cn } from "@/lib/utils";

const ITEM_STATE_CONFIG = {
	new: { color: "bg-green-500", label: "New feature" },
	removed: { color: "bg-red-500", label: "Removed" },
} as const;

export type ItemStatusState = keyof typeof ITEM_STATE_CONFIG;

/** Small green/red status dot with a tooltip — shared by the update-subscription
 * sheet and the chat catalog preview so diffs read the same everywhere. */
export function ItemStatusDot({ state }: { state: ItemStatusState }) {
	const { color, label } = ITEM_STATE_CONFIG[state];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className={cn("size-2 shrink-0 rounded-full", color)} />
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	);
}
