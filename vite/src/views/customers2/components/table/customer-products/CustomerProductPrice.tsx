import type { FullCusProduct } from "@autumn/shared";
import {
	cusProductToProduct,
	mapToProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";

export const CustomerProductPrice = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();

	// Convert FullCusProduct to FullProduct, then to ProductV2, then to FrontendProduct
	const fullProduct = cusProductToProduct({ cusProduct });
	const productV2 = mapToProductV2({ product: fullProduct });
	const frontendProduct = productV2ToFrontendProduct({ product: productV2 });

	// Handle edge case of no items
	if (!frontendProduct.items || frontendProduct.items.length === 0) {
		return <div className="text-tertiary-foreground">-</div>;
	}

	const priceDisplay = getBasePriceDisplay({
		product: productForDisplay(frontendProduct),
		currency: displayCurrency,
	});

	// Render based on the display type
	switch (priceDisplay.type) {
		case "price":
			return (
				<div className="flex items-center gap-1">
					<span className="text-muted-foreground">
						{priceDisplay.formattedAmount}
					</span>
					<span className="text-tertiary-foreground">
						{priceDisplay.intervalText}
					</span>
				</div>
			);
		case "free":
		case "variable":
			return (
				<div className="text-tertiary-foreground">
					{priceDisplay.displayText}
				</div>
			);
		case "placeholder":
			return <div className="text-tertiary-foreground">-</div>;
	}
};
