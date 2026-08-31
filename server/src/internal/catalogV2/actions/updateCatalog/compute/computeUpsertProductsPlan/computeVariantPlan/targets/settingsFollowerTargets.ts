import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import {
	reachInternalIdsForBaseUpsert,
	variantRowsAnchoredTo,
} from "../variantPlanUtils";
import type { VariantEditTarget } from "./variantEditTarget";

const latestRowPerPlan = ({
	anchored,
}: {
	anchored: FullProduct[];
}): FullProduct[] => {
	const byPlan = new Map<string, FullProduct[]>();
	for (const row of anchored) {
		const rows = byPlan.get(row.id) ?? [];
		rows.push(row);
		byPlan.set(row.id, rows);
	}
	return [...byPlan.values()].map(
		(rows) =>
			rows.find((row) => row.active) ??
			rows.slice().sort((left, right) => right.version - left.version)[0],
	);
};

/** Variants anchored to this base follow its settings — latest row per plan. */
export const settingsFollowerTargets = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): VariantEditTarget[] => {
	const anchored = variantRowsAnchoredTo({
		baseInternalIds: reachInternalIdsForBaseUpsert({ upsert }),
		productStatesContext,
	});
	return latestRowPerPlan({ anchored }).map((row) => ({ row }));
};
