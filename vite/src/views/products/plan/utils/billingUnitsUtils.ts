import { type Feature, getFeatureName, type ProductItem } from "@autumn/shared";

/** The feature's unit in lowercase; a bare name like "Users" reads "user" in the singular. */
export const featureUnitName = ({
	feature,
	plural,
}: {
	feature: Feature | undefined;
	plural: boolean;
}) => {
	const name = getFeatureName({ feature, plural }).toLowerCase();
	if (plural || feature?.display?.singular) return name;
	return name.replace(/s$/, "");
};

export const billingUnitsLabel = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const feature = features.find((feature) => feature.id === item.feature_id);
	if ((item.billing_units ?? 1) === 1) {
		return `per ${featureUnitName({ feature, plural: false })}`;
	}
	return `per ${item.billing_units} ${featureUnitName({ feature, plural: true })}`;
};
