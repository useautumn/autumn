import {
	type Feature,
	findFeatureById,
	formatAmount,
	getFeatureName,
	isFeaturePriceItem,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { getBasePriceLabel } from "@/components/forms/customer-state/customerStatePlanPrice";
import { PRICE_VARIES_LABEL } from "@/utils/product/basePriceDisplayUtils";
import { compactPriceLabel } from "./compactPriceLabel";

const firstUnitAmount = (item: ProductItem) =>
	item.price ?? item.tiers?.[0]?.amount ?? null;

const unitLabel = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const billingUnits = item.billing_units ?? 1;
	const feature = item.feature_id
		? findFeatureById({ features, featureId: item.feature_id })
		: undefined;
	const name =
		getFeatureName({ feature, units: billingUnits }).toLowerCase() ||
		(item.feature_id ?? "");

	return billingUnits > 1 ? `${billingUnits.toLocaleString()} ${name}` : name;
};

/** A plan with no base price shows its first feature's unit price, e.g. "From $10/seat +1". */
const featureUnitPriceLabel = ({
	product,
	features,
	currency,
}: {
	product: ProductV2;
	features: Feature[];
	currency: string;
}) => {
	const pricedItems = product.items.filter(isFeaturePriceItem);
	const [item] = pricedItems;
	const amount = item ? firstUnitAmount(item) : null;
	if (!item || amount === null) return undefined;

	const price = formatAmount({
		amount,
		currency,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});
	const isTiered = (item.tiers?.length ?? 0) > 1;
	const otherPricedCount = pricedItems.length - 1;

	return [
		isTiered ? "From " : "",
		`${price}/${unitLabel({ item, features })}`,
		otherPricedCount > 0 ? ` +${otherPricedCount}` : "",
	].join("");
};

export const reviewPlanPriceLabel = ({
	product,
	features,
	currency,
}: {
	product: ProductV2;
	features: Feature[];
	currency: string;
}) => {
	const baseLabel = getBasePriceLabel({ product, currency });
	if (baseLabel !== PRICE_VARIES_LABEL) return compactPriceLabel(baseLabel);

	return (
		featureUnitPriceLabel({ product, features, currency }) ?? PRICE_VARIES_LABEL
	);
};
