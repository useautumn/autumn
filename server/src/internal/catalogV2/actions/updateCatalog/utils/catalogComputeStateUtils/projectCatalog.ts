import type { Feature, FullProduct } from "@autumn/shared";
import type {
	CatalogPlanDraft,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";

/**
 * Pure projection: catalog after `plan` applies.
 * Always derived from originals + the full draft (billing's applyPlan analogue).
 */
export const projectCatalog = ({
	originalFeatures,
	originalProducts,
	plan,
}: {
	originalFeatures: Feature[];
	originalProducts: FullProduct[];
	plan: CatalogPlanDraft;
}): ProjectedCatalog => {
	const nextFeatureByInternalId = new Map(
		plan.updateFeatures.flatMap((updateFeaturePlan) =>
			updateFeaturePlan.current.internal_id
				? [
						[
							updateFeaturePlan.current.internal_id,
							updateFeaturePlan.next,
						] as const,
					]
				: [],
		),
	);
	// Keep upserted+removed features in the projection so later compute can
	// resolve items; errors owns the same-call conflict.
	const upsertedFeatureIds = new Set([
		...plan.insertFeatures.map((feature) => feature.id),
		...plan.updateFeatures.flatMap((updateFeaturePlan) => [
			updateFeaturePlan.current.id,
			updateFeaturePlan.next.id,
		]),
	]);
	const removedFeatureInternalIds = new Set(
		plan.removeFeatures.flatMap((removeFeaturePlan) =>
			removeFeaturePlan.current?.internal_id &&
			!upsertedFeatureIds.has(removeFeaturePlan.featureId)
				? [removeFeaturePlan.current.internal_id]
				: [],
		),
	);

	const nextProductByInternalId = new Map(
		plan.upsertProducts.flatMap((upsertProductPlan) => {
			const { op, currentFullProduct, nextFullProduct } = upsertProductPlan.row;
			return op !== "create" && currentFullProduct?.internal_id
				? ([[currentFullProduct.internal_id, nextFullProduct]] as const)
				: [];
		}),
	);
	const createdProducts = plan.upsertProducts
		.filter((upsertProductPlan) => upsertProductPlan.row.op === "create")
		.map((upsertProductPlan) => upsertProductPlan.row.nextFullProduct);

	return {
		features: [
			...originalFeatures
				.filter(
					(feature) =>
						!feature.internal_id ||
						!removedFeatureInternalIds.has(feature.internal_id),
				)
				.map(
					(feature) =>
						(feature.internal_id &&
							nextFeatureByInternalId.get(feature.internal_id)) ||
						feature,
				),
			...plan.insertFeatures,
		],
		products: [
			...originalProducts.map(
				(product) =>
					nextProductByInternalId.get(product.internal_id) ?? product,
			),
			...createdProducts,
		],
	};
};
