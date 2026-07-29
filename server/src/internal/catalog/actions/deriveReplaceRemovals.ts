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

export type ReplacePlanRemoval =
	| {
			planId: string;
			allVersions: true;
	  }
	| {
			planId: string;
			allVersions: false;
			version: number;
	  };

export const deriveReplacePlanRemovals = ({
	products,
	plans,
}: {
	products: FullProduct[];
	plans: CatalogUpdateParams["plans"];
}): ReplacePlanRemoval[] => {
	const desiredPlanIds = new Set(
		plans.flatMap((plan) => [plan.plan_id, plan.new_plan_id].filter(Boolean)),
	);
	const desiredLatestPlanIds = new Set(
		plans
			.filter((plan) => plan.version === undefined)
			.flatMap((plan) => [plan.plan_id, plan.new_plan_id].filter(Boolean)),
	);
	const desiredVersionKeys = new Set(
		plans.flatMap((plan) => {
			if (plan.version === undefined) return [];
			return [plan.plan_id, plan.new_plan_id]
				.filter(Boolean)
				.map((planId) => `${planId}:${plan.version}`);
		}),
	);
	const omittedPlanIds = new Set<string>();

	return products.flatMap((product): ReplacePlanRemoval[] => {
		if (product.archived) return [];
		if (!desiredPlanIds.has(product.id)) {
			if (omittedPlanIds.has(product.id)) return [];
			omittedPlanIds.add(product.id);
			return [{ planId: product.id, allVersions: true }];
		}
		if (
			!desiredLatestPlanIds.has(product.id) &&
			!desiredVersionKeys.has(`${product.id}:${product.version}`)
		) {
			return [
				{
					planId: product.id,
					version: product.version,
					allVersions: false,
				},
			];
		}
		return [];
	});
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
		.filter(
			(feature) => !feature.archived && !desiredFeatureIds.has(feature.id),
		)
		.map((feature) => feature.id);
};
