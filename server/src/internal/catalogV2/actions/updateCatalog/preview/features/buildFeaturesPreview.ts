import type {
	CatalogFeatureUpdatePreview,
	PreviewUpdateCatalogResponse,
} from "@autumn/shared";
import { buildFeatureUsage } from "@/internal/catalogV2/actions/updateCatalog/preview/features/featureUsage/buildFeatureUsage";
import { formatFeatureUsageMessages } from "@/internal/catalogV2/actions/updateCatalog/preview/features/featureUsage/formatFeatureUsageMessages";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Pure map: computed plan + previewContext facts → preview response features. */
export const buildFeaturesPreview = ({
	catalogContext,
	updateCatalogPlan,
}: {
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): PreviewUpdateCatalogResponse["features"] => {
	const previewContext = catalogContext.previewContext;
	const projectedFeatures = updateCatalogPlan.projected.features;

	const features: CatalogFeatureUpdatePreview[] = [
		...updateCatalogPlan.insertFeatures.map((feature) => {
			const usage = buildFeatureUsage({
				featureIds: [feature.id],
				previewContext,
				projectedFeatures,
			});
			return {
				feature_id: feature.id,
				name: feature.name,
				action: "create" as const,
				state: {
					has_customers: false,
					will_archive: false,
					usage,
					reasons: [],
				},
				previous_attributes: null,
			};
		}),
		...updateCatalogPlan.updateFeatures.map((updateFeaturePlan) => {
			const featureIds =
				updateFeaturePlan.current.id === updateFeaturePlan.next.id
					? [updateFeaturePlan.current.id]
					: [updateFeaturePlan.current.id, updateFeaturePlan.next.id];
			const usage = buildFeatureUsage({
				featureIds,
				previewContext,
				projectedFeatures,
			});
			return {
				feature_id: updateFeaturePlan.next.id,
				name: updateFeaturePlan.next.name,
				action: updateFeaturePlan.previousAttributes
					? ("update" as const)
					: ("none" as const),
				state: {
					has_customers: updateFeaturePlan.hasCustomerEntitlements,
					will_archive: false,
					usage,
					reasons: [],
				},
				previous_attributes: updateFeaturePlan.previousAttributes,
			};
		}),
		...updateCatalogPlan.removeFeatures.map((removeFeaturePlan) => {
			const usage = buildFeatureUsage({
				featureIds: [removeFeaturePlan.featureId],
				previewContext,
				projectedFeatures,
			});
			return {
				feature_id: removeFeaturePlan.featureId,
				name: removeFeaturePlan.current?.name,
				action: "delete" as const,
				state: {
					has_customers: removeFeaturePlan.hasCustomerEntitlements,
					will_archive: removeFeaturePlan.willArchive,
					usage,
					reasons: removeFeaturePlan.willArchive
						? formatFeatureUsageMessages({ usage })
						: [],
				},
				previous_attributes: null,
			};
		}),
	];

	return features;
};
