import {
	formatAmount,
	getIntervalString,
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

	const renderPriceContent = () => {
		if (product.planType === "free") {
			return <span className="text-main-sec inline-block">Free</span>;
		}

		const price = productV3.price;
		const priceExists = notNullish(price) && price.amount > 0;
		if (priceExists && price) {
			const formattedAmount = formatAmount({
				org: org as unknown as Organization,
				amount: price.amount,
				amountFormatOptions: {
					style: "currency",
					currency: org?.default_currency || "USD",
					currencyDisplay: "narrowSymbol",
				},
			});

			const secondaryText = price.interval
				? `${getIntervalString({ interval: price.interval, intervalCount: price.intervalCount })}`
				: "one-off";

			return (
				<span className="text-body-secondary">
					<span className="text-main-sec">{formattedAmount}</span>{" "}
					{secondaryText}
				</span>
			);
		}

		if (product.basePriceType === "usage") {
			return (
				<span className="text-t4 text-body-secondary inline-block mt-[4.5px]">
					Usage-based
				</span>
			);
		}

		return (
			<span className="text-t4 text-body-secondary inline-block mt-[4.5px]">
				No base price
			</span>
		);
	};

	return (
		<div className={cn(isOnboarding && "mt-1")}>{renderPriceContent()}</div>
	);
};
