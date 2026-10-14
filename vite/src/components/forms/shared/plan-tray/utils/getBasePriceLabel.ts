import { type ProductV2, productV2ToFrontendProduct } from "@autumn/shared";
import {
	getBasePriceDisplay,
	PRICE_VARIES_LABEL,
} from "@/utils/product/basePriceDisplayUtils";

export const getBasePriceLabel = ({
	product,
	currency,
}: {
	product: ProductV2;
	currency: string;
}): string => {
	const display = getBasePriceDisplay({
		product: productV2ToFrontendProduct({ product }),
		currency,
	});
	return display.type === "variable" ? PRICE_VARIES_LABEL : display.displayText;
};
