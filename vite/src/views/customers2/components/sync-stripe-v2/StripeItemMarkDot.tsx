import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { cn } from "@/lib/utils";
import type { StripeItemMark } from "./previewMismatches";

const STRIPE_ITEM_MARKS: Record<
	StripeItemMark,
	{ label: string; className: string }
> = {
	linked: { label: "Linked", className: "bg-green-500" },
	links_on_sync: { label: "Links on sync", className: "bg-amber-500" },
	out_of_sync: { label: "Out of sync", className: "bg-red-500" },
};

export function StripeItemMarkDot({
	mark,
}: {
	mark: StripeItemMark | undefined;
}) {
	if (!mark) return null;
	const { label, className } = STRIPE_ITEM_MARKS[mark];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					role="img"
					aria-label={label}
					className={cn("size-1.5 shrink-0 rounded-full", className)}
				/>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	);
}
