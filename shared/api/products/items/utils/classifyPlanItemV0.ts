import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1";
import type { ApiPlanItemV0 } from "@api/products/items/previousVersions/apiPlanItemV0.js";
import { notNullish } from "@utils/utils.js";

type PlanFeatureWithReset = (ApiPlanItemV0 | CreatePlanItemParamsV1) & {
	reset: NonNullable<(ApiPlanItemV0 | CreatePlanItemParamsV1)["reset"]>;
};

type PlanFeatureWithPrice = (ApiPlanItemV0 | CreatePlanItemParamsV1) & {
	price: NonNullable<(ApiPlanItemV0 | CreatePlanItemParamsV1)["price"]>;
};

export const hasResetInterval = (
	planFeature: ApiPlanItemV0 | CreatePlanItemParamsV1,
): planFeature is PlanFeatureWithReset => {
	return notNullish(planFeature.reset?.interval);
};

export const hasPrice = (
	planFeature: ApiPlanItemV0 | CreatePlanItemParamsV1,
): planFeature is PlanFeatureWithPrice => {
	return notNullish(planFeature.price);
};
