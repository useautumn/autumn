import type { CatalogAction } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import type { CatalogAppliedResult } from "@/internal/catalogV2/execute/executeUpdateCatalogPlan";
import { deleteClaimedPlanAliases } from "@/internal/catalogV2/execute/deleteClaimedPlanAliases.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { applyEntitlementPricesPlan } from "./applyEntitlementPricesPlan";
import { applyFreeTrialPlan } from "./applyFreeTrialPlan";
import { executePlanLicensesPlan } from "./executePlanLicensesPlan";
import { applyProductDetailsUpdate } from "./applyProductDetailsUpdate";
import { clearDefaultFlagFromOtherVersions } from "./clearDefaultFlagFromOtherVersions";
import { syncPlanMetadataAcrossVersions } from "./syncPlanMetadataAcrossVersions";

const executeUpsertProduct = async ({
	ctx,
	upsert,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
}) => {
	if (upsert.row.op === "create") {
		const product = upsert.details?.product ?? upsert.row.nextFullProduct;
		await ctx.db.transaction(async (tx) => {
			const db = tx as unknown as DrizzleCli;
			await deleteClaimedPlanAliases({
				ctx: { ...ctx, db },
				aliasIds: upsert.aliasReplacement
					? [upsert.aliasReplacement.alias_id]
					: [],
			});
			await ProductService.insert({ db, product });
		});
		await clearDefaultFlagFromOtherVersions({ ctx, product });
	}

	await applyEntitlementPricesPlan({ ctx, upsert });
	await applyProductDetailsUpdate({ ctx, upsert });
	await syncPlanMetadataAcrossVersions({ ctx, upsert });
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

/** Persist upsertProducts — product rows first, then plan_license writes. */
export const executeUpsertProducts = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<CatalogAppliedResult[]> => {
	const results: CatalogAppliedResult[] = [];

	// Pass 1: write product rows (details, items, trial).
	for (const upsert of updateCatalogPlan.upsertProducts) {
		await executeUpsertProduct({ ctx, upsert });
		results.push({
			id: upsert.row.planId,
			action: upsertOpToAction({ op: upsert.row.op }),
		});
	}

	// Pass 2: replay plan_license writes after every child row exists.
	for (const upsert of updateCatalogPlan.upsertProducts) {
		await executePlanLicensesPlan({ ctx, upsert });
	}

	return results;
};
