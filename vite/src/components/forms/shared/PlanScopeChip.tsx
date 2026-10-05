import {
	StatusChip,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The plan's scope as a chip that opens the scope picker. Trigger props go to
 * TooltipTrigger, which merges them and their refs onto the chip.
 */
export function PlanScopeChip({
	label,
	isEntityScoped,
	disabled,
	disabledReason,
	...triggerProps
}: ComponentProps<"button"> & {
	label: string;
	isEntityScoped: boolean;
	disabledReason?: string;
}) {
	const tooltip = disabled && disabledReason ? disabledReason : "Change scope";

	return (
		<Tooltip disableHoverablePopup>
			<TooltipTrigger {...triggerProps} closeDelay={0} asChild>
				<button
					type="button"
					aria-disabled={disabled || undefined}
					aria-label={`Scope: ${label}`}
					className={cn(
						"shrink-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
						disabled && "cursor-not-allowed opacity-50",
					)}
				>
					<StatusChip
						className={cn(
							"max-w-36 gap-1",
							!isEntityScoped && "text-tertiary-foreground",
						)}
					>
						<span className="truncate">{label}</span>
						<CaretDownIcon className="size-2.5 shrink-0 opacity-60" />
					</StatusChip>
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				className="pointer-events-none data-closed:animate-none!"
			>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}
