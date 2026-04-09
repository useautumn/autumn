import type { FrontendProduct } from "@autumn/shared";
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
}: {
	priceChange?: PriceChange | null;
	product: FrontendProduct | undefined;
	currency: string;
}) {
	const content = priceChange ? (
		<span className="flex items-center gap-1.5">
			<span className="text-t3">
				{priceChange.oldPrice}
				{priceChange.oldIntervalText && ` ${priceChange.oldIntervalText}`}
			</span>
			<span className="text-t4">-&gt;</span>
			<span className="font-semibold text-t1">{priceChange.newPrice}</span>
			<span className="text-t3">{priceChange.newIntervalText}</span>
		</span>
	) : (
		<PriceDisplay product={product} currency={currency} />
	);

	return (
		<div className="flex gap-2 justify-between items-center mb-3">
			{content}
		</div>
	);
}
