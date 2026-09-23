import type { ProductItem, ProductV2 } from "@autumn/shared";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { cn } from "@/lib/utils";
import { getBasePriceLabel } from "../customerStatePlanPrice";

/** A plan row's base price, green when customizing moved it off the catalog. */
export function PlanPriceLabel({
	product,
	items,
}: {
	product: ProductV2;
	items: ProductItem[] | null;
}) {
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();
	const catalogLabel = getBasePriceLabel({
		product: productForDisplay(product),
		currency: displayCurrency,
	});
	const label = items
		? getBasePriceLabel({
				product: productForDisplay({ ...product, items }),
				currency: displayCurrency,
			})
		: catalogLabel;

	return (
		<span
			className={cn(
				"text-xs tabular-nums",
				label !== catalogLabel
					? "text-emerald-500 font-medium"
					: "text-tertiary-foreground",
			)}
		>
			{label}
		</span>
	);
}
