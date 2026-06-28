import type { CatalogUpdateParams, Feature, FullProduct } from "@autumn/shared";

export const deriveReplacePlanIds = ({
	products,
	plans,
}: {
	products: FullProduct[];
	plans: CatalogUpdateParams["plans"];
}) => {
	const desiredPlanIds = new Set(
		plans.flatMap((plan) => [plan.plan_id, plan.new_plan_id].filter(Boolean)),
	);

	return products
		.filter((product) => !product.archived && !desiredPlanIds.has(product.id))
		.map((product) => product.id);
};

export const deriveReplaceFeatureIds = ({
	features,
	desiredFeatures,
}: {
	features: Feature[];
	desiredFeatures: CatalogUpdateParams["features"];
}) => {
	const desiredFeatureIds = new Set(
		desiredFeatures.map((feature) => feature.feature_id),
	);

	return features
		.filter((feature) => !feature.archived && !desiredFeatureIds.has(feature.id))
		.map((feature) => feature.id);
};
