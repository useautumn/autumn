import type { CatalogAction } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import type { CatalogAppliedResult } from "@/internal/catalogV2/execute/executeUpdateCatalogPlan";
import { ProductService } from "@/internal/products/ProductService.js";
import { applyEntitlementPricesPlan } from "./applyEntitlementPricesPlan";
import { applyFreeTrialPlan } from "./applyFreeTrialPlan";
import { applyProductDetailsUpdate } from "./applyProductDetailsUpdate";

const executeUpsertProduct = async ({
	ctx,
	upsert,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
}) => {
	if (upsert.row.op === "create") {
		const product = upsert.details?.product ?? upsert.row.nextFullProduct;
		await ProductService.insert({ db: ctx.db, product });
	}

	await applyEntitlementPricesPlan({ ctx, upsert });
	await applyProductDetailsUpdate({ ctx, upsert });
	await applyFreeTrialPlan({ ctx, upsert });
};

const upsertOpToAction = ({
	op,
}: {
	op: UpsertProductPlan["row"]["op"];
}): CatalogAction => {
	if (op === "create") return "create";
	if (op === "update") return "update";
	return "none";
};

/** Persist upsertProducts — product row + per-facet apply steps. */
export const executeUpsertProducts = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<CatalogAppliedResult[]> => {
	const results: CatalogAppliedResult[] = [];

	for (const upsert of updateCatalogPlan.upsertProducts) {
		await executeUpsertProduct({ ctx, upsert });
		results.push({
			id: upsert.row.planId,
			action: upsertOpToAction({ op: upsert.row.op }),
		});
	}

	return results;
};
