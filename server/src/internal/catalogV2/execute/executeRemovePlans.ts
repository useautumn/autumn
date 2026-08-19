import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { ProductService } from "@/internal/products/ProductService.js";

/** Archive or hard-delete each removePlans row. Pointer moves are upserts. */
export const executeRemovePlans = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<void> => {
	for (const row of updateCatalogPlan.removePlans) {
		if (!row.current) continue;
		if (row.willArchive) {
			await ProductService.updateByInternalId({
				db: ctx.db,
				internalId: row.current.internal_id,
				update: { archived: true },
			});
			continue;
		}

		await ProductService.deleteByInternalId({
			db: ctx.db,
			internalId: row.current.internal_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
	}
};
