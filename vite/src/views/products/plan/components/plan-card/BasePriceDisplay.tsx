import {
	formatAmount,
	getIntervalString,
	type Organization,
	productV2ToBasePrice,
} from "@autumn/shared";
import { Button } from "@/components/v2/buttons/Button";
import { useOrg } from "@/hooks/common/useOrg";
import {
	useCurrentItem,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import {
	useIsEditingPlanPrice,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { notNullish } from "@/utils/genUtils";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { useOnboardingStore } from "@/views/onboarding3/store/useOnboardingStore";

export const BasePriceDisplay = () => {
	const product = useProductStore((s) => s.product);
	const setSheet = useSheetStore((s) => s.setSheet);
	const isOnboarding = useOnboardingStore((s) => s.isOnboarding);
	const basePrice = productV2ToBasePrice({ product });
	const { org } = useOrg();

	const item = useCurrentItem();

	const isEditingPlanPrice = useIsEditingPlanPrice();

	const handleClick = () => {
		setSheet({ type: "edit-plan-price", itemId: product.id });
	};

	const renderPriceContent = () => {
		if (product.planType === "free") {
			return <span className="text-main-sec inline-block">Free</span>;
		}

		const priceExists = notNullish(basePrice) && basePrice.price > 0;
		if (priceExists && basePrice) {
			const formattedAmount = formatAmount({
				org: org as unknown as Organization,
				amount: basePrice.price,
				amountFormatOptions: {
					style: "currency",
					currency: org?.default_currency || "USD",
					currencyDisplay: "narrowSymbol",
				},
			});

			const secondaryText = basePrice.interval
				? `${getIntervalString({ interval: basePrice.interval, intervalCount: basePrice.interval_count })}`
				: "one-off";

			return (
				<span className="text-body-secondary text-main-sec flex items-center gap-1">
					<span className="text-main-sec">{formattedAmount}</span>{" "}
					{secondaryText}
				</span>
			);
		}

		if (product.basePriceType === "usage") {
			return <span className=" !text-t3">Variable</span>;
		}

		return (
			<span className="text-t4 text-body-secondary inline-block">
				Enter price
			</span>
		);
	};

	return (
		<Button
			variant="secondary"
			size="default"
			className={cn(
				isOnboarding && "mt-1",
				"items-center !h-8 gap-1",
				isEditingPlanPrice && "btn-secondary-active",
			)}
			onClick={() => {
				if (!checkItemIsValid(item!)) return;
				handleClick();
			}}
		>
			{renderPriceContent()}
		</Button>
	);
};
