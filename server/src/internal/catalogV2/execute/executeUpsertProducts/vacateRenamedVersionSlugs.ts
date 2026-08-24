import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { ProductService } from "@/internal/products/ProductService.js";

/** unique_product_version_slug is immediate — clear first so a same-call swap can land. */
export const vacateRenamedVersionSlugs = async ({
	ctx,
	upsertProducts,
}: {
	ctx: AutumnContext;
	upsertProducts: UpsertProductPlan[];
}): Promise<void> => {
	for (const upsert of upsertProducts) {
		if (upsert.row.op !== "update" || !upsert.details) continue;
		const previous = upsert.details.previousAttributes?.version_slug;
		const next = upsert.details.product.version_slug;
		if (previous == null || next == null || previous === next) continue;
		await ProductService.updateByInternalId({
			db: ctx.db,
			internalId: upsert.details.product.internal_id,
			update: { version_slug: null },
		});
	}
};
