import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { upsertToCatalogAction } from "@/internal/catalogV2/actions/updateCatalog/utils/upsertToCatalogAction";
import type { CatalogAppliedResult } from "@/internal/catalogV2/execute/executeUpdateCatalogPlan";
import { deleteClaimedPlanAliases } from "@/internal/catalogV2/execute/deleteClaimedPlanAliases.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { applyEntitlementPricesPlan } from "./applyEntitlementPricesPlan";
import { applyFreeTrialPlan } from "./applyFreeTrialPlan";
import { applyProductDetailsUpdate } from "./applyProductDetailsUpdate";
import { clearDefaultFlagFromOtherVersions } from "./clearDefaultFlagFromOtherVersions";
import { executePlanLicensesPlan } from "./executePlanLicensesPlan";
import { syncPlanMetadataAcrossVersions } from "./syncPlanMetadataAcrossVersions";
import { vacateRenamedVersionSlugs } from "./vacateRenamedVersionSlugs";

const executeUpsertProduct = async ({
	ctx,
	upsert,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
}) => {
	const product = upsert.details?.product ?? upsert.row.nextFullProduct;
	if (upsert.row.op === "create") {
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
	}

	await applyEntitlementPricesPlan({ ctx, upsert });
	await applyProductDetailsUpdate({ ctx, upsert });
	await clearDefaultFlagFromOtherVersions({ ctx, product });
	await syncPlanMetadataAcrossVersions({ ctx, upsert });
	await applyFreeTrialPlan({ ctx, upsert });
};

/** Persist upsertProducts — product rows first, then plan_license writes. */
export const executeUpsertProducts = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<CatalogAppliedResult[]> => {
	return await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as DrizzleCli };
		const results: CatalogAppliedResult[] = [];

		await vacateRenamedVersionSlugs({
			ctx: txCtx,
			upsertProducts: updateCatalogPlan.upsertProducts,
		});

		// Pass 1: write product rows (details, items, trial).
		for (const upsert of updateCatalogPlan.upsertProducts) {
			await executeUpsertProduct({ ctx: txCtx, upsert });
			results.push({
				id: upsert.row.planId,
				action: upsertToCatalogAction({ upsert }),
			});
		}

		// Pass 2: replay plan_license writes after every child row exists.
		for (const upsert of updateCatalogPlan.upsertProducts) {
			await executePlanLicensesPlan({ ctx: txCtx, upsert });
		}

		return results;
	});
};
