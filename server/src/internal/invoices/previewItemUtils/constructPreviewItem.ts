import { formatAmount, type Organization, type Price } from "@autumn/shared";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";

export const constructPreviewItem = ({
	price,
	description,
	priceStr,
	org,
	amount,
}: {
	price: Price;
	description: string;
	priceStr?: string;
	org?: Organization;
	amount?: number;
}) => {
	if (amount) {
		priceStr = formatAmount({
			org,
			amount,
		});
	} else {
		priceStr = priceStr;
	}

	return {
		price: priceStr!,
		description,
		amount,
		usage_model: priceToUsageModel(price),
		price_id: price.id!,
	};
};
