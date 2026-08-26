import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { deleteProductRowAndHandoffActive } from "@/internal/products/repos/activateHighestRemainingProduct";
import { ProductService } from "@/internal/products/ProductService.js";

/** Archive leaves `active` in place. Hard-delete of the active row promotes a survivor. */
export const executeRemovePlans = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<void> => {
	await ctx.db.transaction(async (tx) => {
		for (const row of updateCatalogPlan.removePlans) {
			if (!row.current) continue;
			if (row.willArchive) {
				await ProductService.archiveByInternalId({
					db: tx,
					internalId: row.current.internal_id,
					orgId: ctx.org.id,
					env: ctx.env,
				});
				continue;
			}

			if (row.willTombstone) {
				await ProductService.tombstoneByInternalId({
					db: tx,
					internalId: row.current.internal_id,
					orgId: ctx.org.id,
					env: ctx.env,
					previousVersionSlug: row.current.version_slug,
				});
				continue;
			}

			await deleteProductRowAndHandoffActive({
				db: tx,
				internalId: row.current.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
		}
	});
};
