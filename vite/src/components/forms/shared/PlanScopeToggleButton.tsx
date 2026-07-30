import {
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { SubtractIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function PlanScopeToggleButton({
	open,
	onClick,
}: {
	open: boolean;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<IconButton
					type="button"
					variant="muted"
					size="sm"
					className={cn(
						"size-6 shrink-0 text-tertiary-foreground",
						open && "border-primary text-primary",
					)}
					onClick={onClick}
					aria-expanded={open}
					aria-label="Select scope"
					icon={<SubtractIcon />}
				/>
			</TooltipTrigger>
			<TooltipContent side="top">Select scope</TooltipContent>
		</Tooltip>
	);
}
