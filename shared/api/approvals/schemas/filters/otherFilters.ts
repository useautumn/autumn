import { buildFilterSchema, type FilterOf } from "./buildFilterSchema";
import { IdMatcherSchema, sharedFilterFields } from "./filterFields";

/** Redeem a reward; the promo code resolves to its `reward_id`. */
export const rewardRedeemFilterShape = {
	customer: sharedFilterFields.customer,
	reward_id: IdMatcherSchema.optional(),
};

export const RewardRedeemFilterSchema = buildFilterSchema({
	shape: rewardRedeemFilterShape,
});
export type RewardRedeemFilter = FilterOf<typeof rewardRedeemFilterShape>;

/** Update or delete a customer. */
export const customerChangeFilterShape = {
	customer: sharedFilterFields.customer,
};

export const CustomerChangeFilterSchema = buildFilterSchema({
	shape: customerChangeFilterShape,
});
export type CustomerChangeFilter = FilterOf<typeof customerChangeFilterShape>;

/** Create, update or delete a plan. */
export const planCatalogFilterShape = { plan_id: IdMatcherSchema.optional() };

export const PlanCatalogFilterSchema = buildFilterSchema({
	shape: planCatalogFilterShape,
});
export type PlanCatalogFilter = FilterOf<typeof planCatalogFilterShape>;

/** Create, update or delete a feature. */
export const featureChangeFilterShape = {
	feature_id: sharedFilterFields.feature_id,
};

export const FeatureChangeFilterSchema = buildFilterSchema({
	shape: featureChangeFilterShape,
});
export type FeatureChangeFilter = FilterOf<typeof featureChangeFilterShape>;
