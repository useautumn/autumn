import { InfoIcon } from "@phosphor-icons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";

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
