import type { FullCusProduct } from "@autumn/shared";
import {
	cusProductToProduct,
	mapToProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";

export const CustomerProductPrice = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const { org } = useOrg();

	// Convert FullCusProduct to FullProduct, then to ProductV2, then to FrontendProduct
	const fullProduct = cusProductToProduct({ cusProduct });
	const productV2 = mapToProductV2({ product: fullProduct });
	const frontendProduct = productV2ToFrontendProduct({ product: productV2 });

	// Handle edge case of no items
	if (!frontendProduct.items || frontendProduct.items.length === 0) {
		return <div className="text-t3">-</div>;
	}

	// Get the base price display information
	const priceDisplay = getBasePriceDisplay({
		product: frontendProduct,
		currency: org?.default_currency,
	});

	// Render based on the display type
	switch (priceDisplay.type) {
		case "price":
			return (
				<div className="flex items-center gap-1">
					<span className="text-t2">{priceDisplay.formattedAmount}</span>
					<span className="text-t3">{priceDisplay.intervalText}</span>
				</div>
			);
		case "free":
		case "variable":
			return <div className="text-t3">{priceDisplay.displayText}</div>;
		case "placeholder":
			return <div className="text-t3">-</div>;
	}
};
