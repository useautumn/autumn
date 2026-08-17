import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { QuestionIcon } from "@phosphor-icons/react";

export function UsageAnchorTooltip() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<QuestionIcon className="size-3.5 cursor-help text-tertiary-foreground" />
			</TooltipTrigger>
			<TooltipContent className="max-w-64">
				By default the window follows the customer's billing cycle, so a daily
				cap resets at their renewal time. Anchor to UTC to reset at midnight UTC.
			</TooltipContent>
		</Tooltip>
	);
}
