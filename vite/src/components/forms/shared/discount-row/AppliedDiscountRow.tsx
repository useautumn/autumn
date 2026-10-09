import { IconButton } from "@autumn/ui";
import {
	ArrowCounterClockwiseIcon,
	TicketIcon,
	XIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
	type AppliedDiscount,
	appliedDiscountLabel,
} from "../utils/appliedDiscountLabel";

export function AppliedDiscountRow({
	discount,
	removed,
	onToggleRemoved,
}: {
	discount: AppliedDiscount;
	removed: boolean;
	onToggleRemoved: () => void;
}) {
	return (
		<div className="flex items-center gap-2 h-8">
			<TicketIcon
				size={13}
				weight="duotone"
				className="shrink-0 text-tertiary-foreground"
			/>
			<span
				className={cn(
					"flex-1 min-w-0 truncate text-xs",
					removed && "line-through text-tertiary-foreground",
				)}
			>
				{appliedDiscountLabel({ discount })}
			</span>
			{removed && (
				<span className="text-tertiary-foreground text-xs shrink-0">
					Removing
				</span>
			)}
			<IconButton
				variant="muted"
				size="sm"
				onClick={onToggleRemoved}
				aria-label={removed ? "Keep discount" : "Remove discount"}
				icon={
					removed ? (
						<ArrowCounterClockwiseIcon size={12} />
					) : (
						<XIcon size={12} />
					)
				}
				className={cn(
					"shrink-0 text-tertiary-foreground",
					!removed && "hover:text-red-500",
				)}
			/>
		</div>
	);
}
