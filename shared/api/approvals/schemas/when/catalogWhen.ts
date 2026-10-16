import { buildWhenSchema, type WhenOf } from "./buildWhenSchema";
import { IdMatcherSchema, sharedWhenFields } from "./whenFields";

/** Edit plans: the plan being edited. */
export const catalogPlanWhenShape = { plan_id: IdMatcherSchema.optional() };

export const CatalogPlanWhenSchema = buildWhenSchema({
	shape: catalogPlanWhenShape,
});
export type CatalogPlanWhen = WhenOf<typeof catalogPlanWhenShape>;

/** Edit features: the feature being edited. */
export const catalogFeatureWhenShape = {
	feature_id: sharedWhenFields.feature_id,
};

export const CatalogFeatureWhenSchema = buildWhenSchema({
	shape: catalogFeatureWhenShape,
});
export type CatalogFeatureWhen = WhenOf<typeof catalogFeatureWhenShape>;
