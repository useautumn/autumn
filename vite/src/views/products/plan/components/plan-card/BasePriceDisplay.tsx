import {
	type FrontendProduct,
	formatAmount,
	formatInterval,
	type Organization,
	type ProductV2,
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

export const BasePriceDisplay = ({
	isOnboarding,
	product: productProp,
	readOnly = false,
}: {
	isOnboarding?: boolean;
	product?: ProductV2 | FrontendProduct;
	readOnly?: boolean;
}) => {
	const productFromStore = useProductStore((s) => s.product);
	const product = productProp ?? productFromStore;
	const setSheet = useSheetStore((s) => s.setSheet);
	const basePrice = productV2ToBasePrice({ product });
	const { org } = useOrg();

	const item = useCurrentItem();

	const isEditingPlanPrice = useIsEditingPlanPrice();

	const handleClick = () => {
		setSheet({ type: "edit-plan-price", itemId: product.id });
	};

	const renderPriceContent = () => {
		const frontendProduct = product as FrontendProduct;

		if (frontendProduct.planType === "free") {
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
				? `${formatInterval({ interval: basePrice.interval, intervalCount: basePrice.interval_count ?? undefined })}`
				: "one-off";

			return (
				<span className="text-body-secondary flex items-center gap-1">
					<span className="text-main-sec text-t2! font-semibold!">
						{formattedAmount}
					</span>{" "}
					<span className="mt-0.5">{secondaryText}</span>
				</span>
			);
		}

		if (frontendProduct.basePriceType === "usage") {
			return <span className="text-t3!">Variable</span>;
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
				"items-center h-9! gap-1 rounded-xl px-2.5! hover:z-95",
				isEditingPlanPrice && !isOnboarding && "btn-secondary-active z-95",
				isOnboarding &&
					"bg-transparent! border-none! outline-0! border-transparent! pointer-events-none shadow-none! p-0! h-fit! mt-1",
				readOnly &&
					"pointer-events-none bg-transparent! border-none! shadow-none! p-0!",
			)}
			onClick={() => {
				if (readOnly) return;
				if (item && !checkItemIsValid(item)) return;
				handleClick();
			}}
		>
			{renderPriceContent()}
		</Button>
	);
};
