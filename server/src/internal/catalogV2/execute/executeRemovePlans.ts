import { planLicenses } from "@autumn/shared";
import { eq, or } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { ProductService } from "@/internal/products/ProductService.js";
import { deleteProductRowAndHandoffActive } from "@/internal/products/repos/activateHighestRemainingProduct";

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

			// Junction rows RESTRICT the row's items; dropping its links first
			// makes removal order between a parent and its license irrelevant.
			await tx
				.delete(planLicenses)
				.where(
					or(
						eq(
							planLicenses.parent_internal_product_id,
							row.current.internal_id,
						),
						eq(
							planLicenses.license_internal_product_id,
							row.current.internal_id,
						),
					),
				);

			await deleteProductRowAndHandoffActive({
				db: tx,
				internalId: row.current.internal_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
		}
	});
};
