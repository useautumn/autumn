import type { ProductV2 } from "@autumn/shared";
import { productV2ToFrontendProduct } from "@autumn/shared";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";

/** Price cell for a license plan row. Included-only seats read as free; paid
 * seats show the license plan's price, and a mixed pool shows both. */
export function LicensePlanPrice({
	product,
	includedQuantity,
	paidQuantity,
}: {
	product: ProductV2 | null;
	includedQuantity: number;
	paidQuantity: number;
}) {
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();

	if (!product || !product.items || product.items.length === 0) {
		return <div className="text-tertiary-foreground">-</div>;
	}

	const frontendProduct = productV2ToFrontendProduct({ product });
	const priceDisplay = getBasePriceDisplay({
		product: productForDisplay(frontendProduct),
		currency: displayCurrency,
	});

	if (priceDisplay.type !== "price") {
		return (
			<div className="text-tertiary-foreground">
				{priceDisplay.type === "placeholder" ? "-" : priceDisplay.displayText}
			</div>
		);
	}

	if (paidQuantity <= 0) {
		return <div className="text-tertiary-foreground">Free</div>;
	}

	return (
		<div className="flex items-center gap-1">
			{includedQuantity > 0 && (
				<span className="text-tertiary-foreground">Free +</span>
			)}
			<span className="text-muted-foreground">
				{priceDisplay.formattedAmount}
			</span>
			<span className="text-tertiary-foreground">
				{priceDisplay.intervalText}
			</span>
		</div>
	);
}
