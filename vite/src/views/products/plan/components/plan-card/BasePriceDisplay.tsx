import {
	formatAmount,
	mapToProductV3,
	type Organization,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { cn } from "@/lib/utils";
import { notNullish } from "@/utils/genUtils";
import { useOnboardingStore } from "@/views/onboarding3/store/useOnboardingStore";

export const BasePriceDisplay = () => {
	const product = useProductStore((s) => s.product);
	const productV3 = mapToProductV3({ product });
	const isOnboarding = useOnboardingStore((s) => s.isOnboarding);
	const { org } = useOrg();

	const formattedAmount = formatAmount({
		org: org as unknown as Organization,
		amount: productV3.price?.amount ?? 0,
		amountFormatOptions: {
			style: "currency",
			currency: org?.default_currency || "USD",
			currencyDisplay: "narrowSymbol",
		},
	});

	const secondaryText = productV3.price?.interval
		? `per ${productV3.price.interval}`
		: "once";

	const priceExists = notNullish(productV3.price);
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
