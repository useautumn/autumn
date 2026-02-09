import type { ApiPlanItemV0 } from "@api/products/items/apiPlanItemV0.js";
import type { CreatePlanItemParamsV0 } from "@api/products/items/crud/createPlanItemV0Params.js";
import { notNullish } from "@utils/utils.js";

type PlanFeatureWithReset = (ApiPlanItemV0 | CreatePlanItemParamsV0) & {
	reset: NonNullable<(ApiPlanItemV0 | CreatePlanItemParamsV0)["reset"]>;
};

type PlanFeatureWithPrice = (ApiPlanItemV0 | CreatePlanItemParamsV0) & {
	price: NonNullable<(ApiPlanItemV0 | CreatePlanItemParamsV0)["price"]>;
};

export const hasResetInterval = (
	planFeature: ApiPlanItemV0 | CreatePlanItemParamsV0,
): planFeature is PlanFeatureWithReset => {
	return notNullish(planFeature.reset?.interval);
};

export const hasPrice = (
	planFeature: ApiPlanItemV0 | CreatePlanItemParamsV0,
): planFeature is PlanFeatureWithPrice => {
	return notNullish(planFeature.price);
};
