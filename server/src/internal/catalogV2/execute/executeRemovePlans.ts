import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import {
	activateHighestRemainingProduct,
	deleteProductRowAndHandoffActive,
} from "@/internal/products/repos/activateHighestRemainingProduct";
import { ProductService } from "@/internal/products/ProductService.js";

/** Archive or hard-delete each removePlans row. Pointer moves are upserts. */
export const executeRemovePlans = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<void> => {
	await ctx.db.transaction(async (tx) => {
		const archivedPlanIds = new Set<string>();

		for (const row of updateCatalogPlan.removePlans) {
			if (!row.current) continue;
			if (row.willArchive) {
				await ProductService.archiveByInternalId({
					db: tx,
					internalId: row.current.internal_id,
					orgId: ctx.org.id,
					env: ctx.env,
				});
				archivedPlanIds.add(row.planId);
				continue;
			}

			await deleteProductRowAndHandoffActive({
				db: tx,
				internalId: row.current.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
		}

		for (const planId of archivedPlanIds) {
			await activateHighestRemainingProduct({
				db: tx,
				orgId: ctx.org.id,
				env: ctx.env,
				productId: planId,
			});
		}
	});
};
