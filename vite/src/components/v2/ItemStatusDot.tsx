import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { cn } from "@/lib/utils";

const ITEM_STATE_CONFIG = {
	new: { color: "bg-green-500", label: "New feature" },
	removed: { color: "bg-red-500", label: "Removed" },
	updated: { color: "bg-amber-500", label: "Updated" },
	scheduled: { color: "bg-blue-500", label: "Scheduled" },
} as const;

export type ItemStatusState = keyof typeof ITEM_STATE_CONFIG;

export function ChangeDot({ state }: { state: ItemStatusState }) {
	return (
		<span
			className={cn(
				"size-2 shrink-0 rounded-sm",
				ITEM_STATE_CONFIG[state].color,
			)}
		/>
	);
}

export function ItemStatusDot({ state }: { state: ItemStatusState }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex">
					<ChangeDot state={state} />
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">
				{ITEM_STATE_CONFIG[state].label}
			</TooltipContent>
		</Tooltip>
	);
}
