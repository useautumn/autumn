import type { Feature, FullProduct } from "@autumn/shared";
import type {
	CatalogPlanDraft,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";

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
			!removeFeaturePlan.willArchive &&
			!upsertedFeatureIds.has(removeFeaturePlan.featureId)
				? [removeFeaturePlan.current.internal_id]
				: [],
		),
	);
	const archivedFeatureByInternalId = new Map(
		plan.removeFeatures.flatMap((removeFeaturePlan) =>
			removeFeaturePlan.current?.internal_id && removeFeaturePlan.willArchive
				? [
						[
							removeFeaturePlan.current.internal_id,
							{ ...removeFeaturePlan.current, archived: true },
						] as const,
					]
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

	const upsertedRows = new Set(
		plan.upsertProducts
			.filter((upsert) => upsert.row.source !== "demoted_product")
			.map((upsert) => `${upsert.row.planId}@${upsert.row.version}`),
	);
	const hardDeletedInternalIds = new Set(
		plan.removePlans.flatMap((removePlan) =>
			removePlan.current &&
			!removePlan.willArchive &&
			!upsertedRows.has(`${removePlan.planId}@${removePlan.version}`)
				? [removePlan.current.internal_id]
				: [],
		),
	);
	const archivedByInternalId = new Map(
		plan.removePlans.flatMap((removePlan) =>
			removePlan.current && removePlan.willArchive
				? [
						[
							removePlan.current.internal_id,
							{ ...removePlan.current, archived: true },
						] as const,
					]
				: [],
		),
	);

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
							(nextFeatureByInternalId.get(feature.internal_id) ??
								archivedFeatureByInternalId.get(feature.internal_id))) ||
						feature,
				),
			...plan.insertFeatures,
		],
		products: [
			...originalProducts
				.filter((product) => !hardDeletedInternalIds.has(product.internal_id))
				.map(
					(product) =>
						nextProductByInternalId.get(product.internal_id) ??
						archivedByInternalId.get(product.internal_id) ??
						product,
				),
			...createdProducts,
		],
	};
};
