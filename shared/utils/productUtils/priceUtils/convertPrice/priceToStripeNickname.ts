import { BillingType } from "@models/productModels/priceModels/priceEnums";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { getBillingType } from "../../priceUtils";

export type StripePriceNicknameSource = "catalog" | "customize";

const priceKindLabel = ({ billingType }: { billingType: BillingType }) => {
	if (billingType === BillingType.UsageInAdvance) return "Prepaid price";
	if (
		billingType === BillingType.UsageInArrear ||
		billingType === BillingType.InArrearProrated
	) {
		return "Usage-based price";
	}
	return "Base price";
};

export const priceToStripeNickname = ({
	price,
	featureName,
	source = "catalog",
	isPlaceholder = false,
}: {
	price: Price;
	featureName?: string | null;
	source?: StripePriceNicknameSource;
	isPlaceholder?: boolean;
}) => {
	const kind = priceKindLabel({ billingType: getBillingType(price.config) });
	const withFeature =
		kind === "Base price" || !featureName ? kind : `${kind} (${featureName})`;
	const placeholder = isPlaceholder ? " [Placeholder]" : "";
	const custom = source === "customize" ? " (custom)" : "";
	return `${withFeature}${placeholder}${custom}`;
};
