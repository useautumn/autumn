import {
	formatAmount,
	getIntervalString,
	type Organization,
	productV2ToBasePrice,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { cn } from "@/lib/utils";
import { notNullish } from "@/utils/genUtils";
import { useOnboardingStore } from "@/views/onboarding3/store/useOnboardingStore";

export const BasePriceDisplay = () => {
	const product = useProductStore((s) => s.product);
	const isOnboarding = useOnboardingStore((s) => s.isOnboarding);
	const basePrice = productV2ToBasePrice({ product });
	const { org } = useOrg();

	const formattedAmount = formatAmount({
		org: org as unknown as Organization,
		amount: basePrice?.price ?? 0,
		amountFormatOptions: {
			style: "currency",
			currency: org?.default_currency || "USD",
			currencyDisplay: "narrowSymbol",
		},
	});

	const secondaryText = basePrice?.interval
		? `${getIntervalString({ interval: basePrice.interval, intervalCount: basePrice.interval_count })}`
		: "once";

	const priceExists = notNullish(basePrice) && basePrice.price > 0;
	return (
		<div className={cn(isOnboarding && "mt-1")}>
			{priceExists ? (
				<span className="text-body-secondary">
					<span className="text-main-sec">{formattedAmount}</span>{" "}
					{secondaryText}
				</span>
			) : (
				<span className="text-t4 text-body-secondary inline-block mt-[4.5px]">
					No base price
				</span>
			)}
		</div>
	);
};
