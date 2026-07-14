import { type Feature, getFeatureName, type ProductItem } from "@autumn/shared";

export const billingUnitsLabel = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const unitName = getFeatureName({
		feature: features.find((feature) => feature.id === item.feature_id),
		plural: Boolean(item.billing_units && item.billing_units > 1),
		capitalize: false,
	});
	return item.billing_units === 1
		? `per ${unitName}`
		: `per ${item.billing_units} ${unitName}`;
};
