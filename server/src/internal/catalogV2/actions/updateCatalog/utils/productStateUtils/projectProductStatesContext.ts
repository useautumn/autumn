import type { FullProduct, RewardProgram } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import type { CustomerProductVersioningUsage } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";
import { buildProductStatesContext } from "./buildProductStatesContext";

/**
 * Pure projection: product state after `upsertProducts` apply (projectCatalog
 * analogue). Rows group by their PROJECTED id, so an id patch re-keys the plan
 * and subsequent intents/derives see the rename.
 */
export const projectProductStatesContext = ({
	original,
	upsertProducts,
}: {
	original: ProductStatesContext;
	upsertProducts: UpsertProductPlan[];
}): ProductStatesContext => {
	const nextRowByInternalId = new Map<string, FullProduct>(
		upsertProducts.flatMap((upsert) => {
			const { op, currentFullProduct, nextFullProduct } = upsert.row;
			return op !== "create" && currentFullProduct
				? ([[currentFullProduct.internal_id, nextFullProduct]] as const)
				: [];
		}),
	);
	const createdRows = upsertProducts
		.filter((upsert) => upsert.row.op === "create")
		.map((upsert) => upsert.row.nextFullProduct);

	const versionsByPlanId = new Map<string, FullProduct[]>();
	const pushRow = (row: FullProduct) => {
		const rows = versionsByPlanId.get(row.id) ?? [];
		rows.push(row);
		versionsByPlanId.set(row.id, rows);
	};
	for (const rows of Object.values(original.versionsByPlanId)) {
		for (const row of rows) {
			pushRow(nextRowByInternalId.get(row.internal_id) ?? row);
		}
	}
	for (const row of createdRows) pushRow(row);
	for (const rows of versionsByPlanId.values()) {
		rows.sort((a, b) => b.version - a.version);
	}
	// Keep original keys alive even when renamed/absent — lookups expect them.
	for (const planId of Object.keys(original.versionsByPlanId)) {
		if (!versionsByPlanId.has(planId)) versionsByPlanId.set(planId, []);
	}

	const usageByInternalId = new Map<string, CustomerProductVersioningUsage>(
		Object.values(original.statesByPlanVersion).map((state) => [
			state.currentFullProduct.internal_id,
			state.customerUsage,
		]),
	);

	// Reward programs follow the plan's projected id.
	const rewardProgramsByPlanId = new Map<string, RewardProgram[]>();
	for (const [planId, programs] of Object.entries(
		original.rewardProgramsByPlanId,
	)) {
		const latest = original.versionsByPlanId[planId]?.[0];
		const projectedId = latest
			? (nextRowByInternalId.get(latest.internal_id)?.id ?? latest.id)
			: planId;
		rewardProgramsByPlanId.set(projectedId, [
			...(rewardProgramsByPlanId.get(projectedId) ?? []),
			...programs,
		]);
	}

	return buildProductStatesContext({
		planIds: [...versionsByPlanId.keys()],
		versionsByPlanId,
		usageByInternalId,
		rewardProgramsByPlanId,
	});
};
