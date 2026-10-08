import type { FullProduct, Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** Only migrations with operations need the catalog, to decide batch eligibility. */
export const listMigrationProducts = async ({
	ctx,
	migrations,
}: {
	ctx: AutumnContext;
	migrations: Migration[];
}): Promise<FullProduct[]> => {
	if (!migrations.some((migration) => migration.operations)) return [];
	return ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
	});
};
