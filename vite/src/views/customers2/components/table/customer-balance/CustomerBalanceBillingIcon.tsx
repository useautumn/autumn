import {
	type FullCusEntWithFullCusProduct,
	isFreeCustomerEntitlement,
	isPrepaidCustomerEntitlement,
} from "@autumn/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import {
	BoxArrowDownIcon,
	MoneyWavyIcon,
	WalletIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

function getBalanceBillingIcon({
	balance,
}: {
	balance: FullCusEntWithFullCusProduct;
}) {
	const size = 14;
	const weight = "duotone" as const;

	if (isFreeCustomerEntitlement(balance))
		return {
			icon: <BoxArrowDownIcon size={size} weight={weight} />,
			color: "text-green-500",
			label: "Included",
		};

	if (isPrepaidCustomerEntitlement(balance))
		return {
			icon: <WalletIcon size={size} weight={weight} />,
			color: "text-orange-500",
			label: "Prepaid price",
		};

	return {
		icon: <MoneyWavyIcon size={size} weight={weight} />,
		color: "text-yellow-500",
		label: "Usage-based price",
	};
}

export function CustomerBalanceBillingIcon({
	balance,
}: {
	balance: FullCusEntWithFullCusProduct;
}) {
	const { icon, color, label } = getBalanceBillingIcon({ balance });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={cn("shrink-0", color)}>{icon}</div>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
