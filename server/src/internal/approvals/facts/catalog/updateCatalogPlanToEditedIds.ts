import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** The plans and features a computed catalog update writes, renames on both sides. */
export const updateCatalogPlanToEditedIds = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}) => ({
	planIds: [
		...updateCatalogPlan.upsertProducts
			.filter(({ row, unlink }) => row.op !== "none" || unlink)
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
