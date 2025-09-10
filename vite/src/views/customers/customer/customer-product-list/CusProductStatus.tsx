import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import { differenceInDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { CusProductStripeLink } from "./CusProductStripeLink";

export const CusProductStatusItem = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const getStatus = () => {
		if (cusProduct.status == CusProductStatus.Expired) {
			return CusProductStatus.Expired;
		}

		const trialing =
			cusProduct.trial_ends_at && cusProduct.trial_ends_at > Date.now();

		const canceled = cusProduct.canceled;

		if (canceled) return "canceled";

		if (trialing) {
			return CusProductStatus.Trialing;
		}

		return cusProduct.status;
	};

	const getTitle = () => {
		const status = getStatus();
		if (status === CusProductStatus.Trialing) {
			const daysTillEnd = differenceInDays(
				new Date(cusProduct.trial_ends_at!),
				new Date(),
			);
			return `trial (${daysTillEnd}d)`;
		}
		return keyToTitle(getStatus()).toLowerCase();
	};

	const statusToColor: Record<CusProductStatus | "canceled", string> = {
		[CusProductStatus.Active]: "bg-lime-500",
		[CusProductStatus.Expired]: "bg-stone-800",
		[CusProductStatus.PastDue]: "bg-red-500",
		[CusProductStatus.Scheduled]: "bg-blue-500",
		[CusProductStatus.Trialing]: "bg-blue-400",
		canceled: "bg-gray-500",
		[CusProductStatus.Unknown]: "bg-gray-500",
	};

	return (
		<div className="flex gap-0.5 items-center">
			<Badge
				variant="status"
				className={cn("h-fit", statusToColor[getStatus()])}
			>
				{getTitle()}
			</Badge>

			<CusProductStripeLink cusProduct={cusProduct} />
		</div>
	);
};
