import {
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { SubtractIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Opens the scope picker. It doubles as the picker's popover trigger, so the
 * incoming trigger props go to TooltipTrigger, which merges both prop sets and
 * their refs onto the one button.
 */
export function PlanScopeToggleButton({
	selectedLabel,
	isEntityScoped,
	className,
	disabled,
	disabledReason,
	...triggerProps
}: ComponentProps<"button"> & {
	/** Label of the chosen scope; absent while the row inherits the sheet scope. */
	selectedLabel?: string;
	/** Only an entity reads as chosen — customer-level is the default, not a choice. */
	isEntityScoped?: boolean;
	disabledReason?: string;
}) {
	const label = selectedLabel ? `Scope: ${selectedLabel}` : "Select scope";
	// aria-disabled rather than disabled: a disabled button swallows the tooltip.
	const tooltip =
		disabled && disabledReason ? `${label} (${disabledReason})` : label;

	return (
		<Tooltip>
			<TooltipTrigger {...triggerProps} asChild>
				<IconButton
					aria-disabled={disabled || undefined}
					aria-label={label}
					className={cn(
						"size-6 shrink-0 text-tertiary-foreground",
						isEntityScoped && "border-primary text-primary",
						disabled && "cursor-not-allowed opacity-50",
						className,
					)}
					icon={<SubtractIcon />}
					size="sm"
					type="button"
					variant="muted"
				/>
			</TooltipTrigger>
			<TooltipContent side="top">{tooltip}</TooltipContent>
		</Tooltip>
	);
}
