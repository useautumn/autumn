import type { FrontendProduct } from "@autumn/shared";
import {
	type AdminPlanIds,
	AdminPlanIdsTooltip,
} from "@/components/forms/shared/admin/AdminPlanIdsTooltip";
import { PriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";

interface PriceChange {
	oldPrice: string;
	newPrice: string;
	oldIntervalText: string | null;
	newIntervalText: string | null;
	isUpgrade: boolean;
}

export function PlanPriceHeader({
	priceChange,
	product,
	currency,
	adminIds,
}: {
	priceChange?: PriceChange | null;
	product: FrontendProduct | undefined;
	currency: string;
	adminIds?: AdminPlanIds;
}) {
	const content = priceChange ? (
		<span className="flex items-center gap-1.5">
			<span className="text-tertiary-foreground">
				{priceChange.oldPrice}
				{priceChange.oldIntervalText && ` ${priceChange.oldIntervalText}`}
			</span>
			<span className="text-subtle">-&gt;</span>
			<span className="font-semibold text-foreground">
				{priceChange.newPrice}
			</span>
			<span className="text-tertiary-foreground">
				{priceChange.newIntervalText}
			</span>
		</span>
	) : (
		<PriceDisplay product={product} currency={currency} />
	);

	const wrapped = adminIds ? (
		<AdminPlanIdsTooltip ids={adminIds}>
			<span className="inline-flex">{content}</span>
		</AdminPlanIdsTooltip>
	) : (
		content
	);

	return (
		<div className="flex gap-2 justify-between items-center mb-1">
			{wrapped}
		</div>
	);
}
