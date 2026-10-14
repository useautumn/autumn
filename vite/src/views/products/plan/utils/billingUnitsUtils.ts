import { type Feature, getFeatureName, type ProductItem } from "@autumn/shared";

/** A bare feature name like "Users" reads "user" in the singular. */
export const featureUnitName = ({
	feature,
	plural,
}: {
	feature?: Feature;
	plural: boolean;
}) => {
	const name = getFeatureName({ feature, plural }).toLowerCase();
	return plural || feature?.display?.singular ? name : name.replace(/s$/, "");
};

export const billingUnitsLabel = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const unitName = featureUnitName({
		feature: features.find((feature) => feature.id === item.feature_id),
		plural: Boolean(item.billing_units && item.billing_units > 1),
	});
	return item.billing_units === 1
		? `per ${unitName}`
		: `per ${item.billing_units} ${unitName}`;
};
