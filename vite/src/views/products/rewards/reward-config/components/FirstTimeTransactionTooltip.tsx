import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { InfoIcon } from "@phosphor-icons/react";

export function FirstTimeTransactionTooltip() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<InfoIcon className="size-3.5 cursor-help text-tertiary-foreground" />
			</TooltipTrigger>
			<TooltipContent>
				Applies when the customer has no prior successful payments or invoices
				in Stripe.
			</TooltipContent>
		</Tooltip>
	);
}
