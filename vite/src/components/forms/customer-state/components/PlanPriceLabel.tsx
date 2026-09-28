import type { ProductItem, ProductV2 } from "@autumn/shared";
import { getSelectedPlanPriceProduct } from "@/components/forms/shared/selectedPlanRowUtils";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { getBasePriceLabel } from "../customerStatePlanPrice";

/** A plan row's base price, including any customized items. */
export function PlanPriceLabel({
	product,
	items,
}: {
	product: ProductV2;
	items: ProductItem[] | null;
}) {
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();
	const label = getBasePriceLabel({
		product: productForDisplay(
			getSelectedPlanPriceProduct({ product, customItems: items }),
		),
		currency: displayCurrency,
	});

	return (
		<span className="text-xs tabular-nums text-tertiary-foreground">
			{label}
		</span>
	);
}
