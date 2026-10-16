import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** The plans and features a computed catalog update writes or states, renames on both sides. */
export const updateCatalogPlanToEditedIds = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}) => ({
	planIds: [
		// A stated plan counts even when its row is unchanged: mappings, licenses and links still write.
		...updateCatalogPlan.upsertProducts
			.filter(({ row }) => row.source === "direct" || row.op !== "none")
			.map(({ row }) => row.planId),
		...updateCatalogPlan.renamePlans.flatMap(({ planId, toId }) => [
			planId,
			toId,
		]),
		...updateCatalogPlan.removePlans.map(({ planId }) => planId),
	],
	featureIds: [
		...updateCatalogPlan.insertFeatures.map(({ id }) => id),
		...updateCatalogPlan.updateFeatures.flatMap(({ current, next }) => [
			current.id,
			next.id,
		]),
		...updateCatalogPlan.removeFeatures.map(({ featureId }) => featureId),
	],
});
