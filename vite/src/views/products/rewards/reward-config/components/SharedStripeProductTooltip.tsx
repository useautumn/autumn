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
			<TooltipContent className="flex max-w-xs flex-col gap-2">
				<span>
					Stripe scopes a coupon to a product, never a single price. Variants
					share their base plan's Stripe product, and usage prices share the
					feature's, so those plans are selected together and a discount on one
					applies to all of them.
				</span>
				<span>
					To target one plan on its own,{" "}
					<Link
						className="underline"
						to={getRedirectUrl("/dev?tab=stripe", env)}
						onClick={(e) => e.stopPropagation()}
					>
						give it a separate Stripe product
					</Link>
					. It then appears as its own row here.
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
