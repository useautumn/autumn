import type { FrontendProduct, ProductV2 } from "@autumn/shared";
import { productV2ToFrontendProduct } from "@autumn/shared";
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
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";
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
	const frontendProduct = productV2ToFrontendProduct({ product });
	const setSheet = useSheetStore((s) => s.setSheet);
	const { org } = useOrg();

	const item = useCurrentItem();

	const isEditingPlanPrice = useIsEditingPlanPrice();

	const handleClick = () => {
		setSheet({ type: "edit-plan-price", itemId: product.id });
	};

	const renderPriceContent = () => {
		const priceDisplay = getBasePriceDisplay({
			product: frontendProduct,
			currency: org?.default_currency,
			showPlaceholder: true,
		});

		switch (priceDisplay.type) {
			case "free":
				return (
					<span className="text-main-sec inline-block">
						{priceDisplay.displayText}
					</span>
				);

			case "price":
				return (
					<span className="text-body-secondary flex items-center gap-1">
						<span className="text-main-sec text-t2! font-semibold!">
							{priceDisplay.formattedAmount}
						</span>{" "}
						<span className="mt-0.5">{priceDisplay.intervalText}</span>
					</span>
				);

			case "variable":
				return <span className="text-t3!">{priceDisplay.displayText}</span>;

			case "placeholder":
				return (
					<span className="text-t4 text-body-secondary inline-block">
						{priceDisplay.displayText}
					</span>
				);
		}
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
