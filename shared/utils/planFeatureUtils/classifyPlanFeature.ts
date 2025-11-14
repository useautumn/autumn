import type { ApiPlanFeature } from "../../api/products/planFeature/apiPlanFeature.js";
import type { UpdatePlanFeatureParams } from "../../api/products/planFeature/planFeatureOpModels.js";
import { notNullish } from "../utils.js";

type PlanFeatureWithReset = (ApiPlanFeature | UpdatePlanFeatureParams) & {
	reset: NonNullable<(ApiPlanFeature | UpdatePlanFeatureParams)["reset"]>;
};

type PlanFeatureWithPrice = (ApiPlanFeature | UpdatePlanFeatureParams) & {
	price: NonNullable<(ApiPlanFeature | UpdatePlanFeatureParams)["price"]>;
};

export const hasResetInterval = (
	planFeature: ApiPlanFeature | UpdatePlanFeatureParams,
): planFeature is PlanFeatureWithReset => {
	return notNullish(planFeature.reset?.interval);
};

export const hasPrice = (
	planFeature: ApiPlanFeature | UpdatePlanFeatureParams,
): planFeature is PlanFeatureWithPrice => {
	return notNullish(planFeature.price);
};
