import { movesActivePointer } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { fullProductForPlanParams } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForPlanParams";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { rowHasVersionableCustomers } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/rowHasVersionableCustomers";

/**
 * Child mint + pinned active parent row with customers → mint the parent
 * max+1. Without customers the pin lane repoints the row in place instead.
 */
export const deriveLicenseParentMintIntents = ({
	intent,
	upsert,
	productStatesContext,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	if (upsert.row.versioning !== "new_version") return [];
	const childTakesActive =
		upsert.row.nextFullProduct.active || movesActivePointer({ upsert });
	if (!childTakesActive) return [];

	const mintedPlanIds = new Set<string>();
	const intents: ProductUpsertIntent[] = [];

	for (const target of upsert.propagate?.license_parents ?? []) {
		if (mintedPlanIds.has(target.plan_id)) continue;

		const pinnedRow = fullProductForPlanParams({
			planParams: target,
			productStatesContext,
		});
		if (!pinnedRow?.active) continue;
		if (!rowHasVersionableCustomers({ row: pinnedRow, productStatesContext })) {
			continue;
		}

		const version =
			maxVersionForPlan({ planId: target.plan_id, productStatesContext }) + 1;
		mintedPlanIds.add(target.plan_id);
		intents.push({
			productKey: { planId: target.plan_id, version },
			planParams: {
				plan_id: target.plan_id,
				version,
				versioning: "new_version",
				...(intent.planParams.active === true ? { active: true } : {}),
				...(target.new_version_slug
					? { new_version_slug: target.new_version_slug }
					: {}),
			},
			source: "license_adopt",
		});
	}

	return intents;
};
