import type { FullCusProduct, Organization } from "@autumn/shared";
import {
	cusProductToProduct,
	formatAmount,
	isFeaturePriceItem,
	mapToProductV2,
	productV2ToBasePrice,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";

export const CustomerProductPrice = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const { org } = useOrg();

	// Convert FullCusProduct to FullProduct, then to ProductV2
	const fullProduct = cusProductToProduct({ cusProduct });
	const productV2 = mapToProductV2({ product: fullProduct });

	// Check if product has items
	if (!productV2.items || productV2.items.length === 0) {
		return <div className="text-t3">-</div>;
	}

	const basePrice = productV2ToBasePrice({ product: productV2 });

	// Check if there are any feature prices
	const hasFeaturePrices = productV2.items.some((item) =>
		isFeaturePriceItem(item),
	);

	// If no base price and no feature prices, show "Free"
	if (!basePrice && !hasFeaturePrices) {
		return <div className="text-t3">Free</div>;
	}

	// If no base price but has feature prices, show "Variable"
	if (!basePrice && hasFeaturePrices) {
		return <div className="text-t3">Variable</div>;
	}

	// If base price exists, format and display it
	if (basePrice) {
		const formattedAmount = formatAmount({
			org: org as unknown as Organization,
			amount: basePrice.price,
			amountFormatOptions: {
				style: "currency",
				currency: org?.default_currency || "USD",
			},
		});
		return <div className="text-t2">{formattedAmount}</div>;
	}

	return <div className="text-t3">-</div>;
};
