import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductRow } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan/upsertProductPlan";
import type { CatalogApprovalCheck } from "./catalogApprovalCheck";

// A stated plan counts even when its row is unchanged: mappings, licenses and links still write.
const rowWrites = (row: Pick<UpsertProductRow, "op" | "source">) =>
	row.op !== "none" || row.source === "direct";

// A new version is minted from an existing plan, so only a row with no base is a new plan.
const rowCreatesPlan = (
	row: Pick<UpsertProductRow, "op" | "baseFullProduct">,
) => row.op === "create" && row.baseFullProduct === null;

/** Every plan and feature a computed catalog update writes, each with its verb; renames count on both ids. */
export const updateCatalogPlanToApprovalChecks = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): CatalogApprovalCheck[] => [
	...updateCatalogPlan.upsertProducts
		.filter(({ row }) => rowWrites(row))
		.map(
			({ row }): CatalogApprovalCheck => ({
				action: rowCreatesPlan(row) ? "plans.create" : "plans.update",
				planId: row.planId,
			}),
		),
	...updateCatalogPlan.renamePlans.flatMap(
		({ planId, toId }): CatalogApprovalCheck[] => [
			{ action: "plans.update", planId },
			{ action: "plans.update", planId: toId },
		],
	),
	...updateCatalogPlan.removePlans.map(
		({ planId }): CatalogApprovalCheck => ({ action: "plans.delete", planId }),
	),
	...updateCatalogPlan.insertFeatures.map(
		({ id }): CatalogApprovalCheck => ({
			action: "features.create",
			featureId: id,
		}),
	),
	...updateCatalogPlan.updateFeatures.flatMap(
		({ current, next }): CatalogApprovalCheck[] => [
			{ action: "features.update", featureId: current.id },
			{ action: "features.update", featureId: next.id },
		],
	),
	...updateCatalogPlan.removeFeatures.map(
		({ featureId }): CatalogApprovalCheck => ({
			action: "features.delete",
			featureId,
		}),
	),
];
