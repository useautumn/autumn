import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";

export function SharedStripeProductTooltip() {
	const env = useEnv();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<InfoIcon className="size-3.5 cursor-help text-tertiary-foreground" />
			</TooltipTrigger>
			<TooltipContent className="max-w-xs">
				Linked plans share the same Stripe product. Stripe only allows coupons
				to be scoped to a product, so a discount on one applies to all of them.
				To target just one plan,{" "}
				<Link
					className="underline"
					to={getRedirectUrl("/dev?tab=stripe", env)}
					onClick={(e) => e.stopPropagation()}
				>
					create a separate Stripe product for it in Stripe settings
				</Link>
				.
			</TooltipContent>
		</Tooltip>
	);
}
