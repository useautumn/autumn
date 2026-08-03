import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getLatestProducts } from "@/internal/products/productUtils.js";

// Derives the latest versions from the all-versions read rather than calling
// listFull again: that second call hits the 24h products cache, which serves a
// stale `processor` (and so drops Stripe product aliases) after any write that
// bypasses invalidateProductsCache.
export const loadCatalogMappingProducts = async ({
	ctx,
}: {
	ctx: AutumnContext;
}) => {
	const { db, org, env } = ctx;

	const everyVersion = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		returnAll: true,
	});

	// Archived is filtered AFTER picking the latest version, matching
	// listFull({ archived: false }).
	const latestProducts = getLatestProducts(everyVersion).filter(
		(product) => !product.archived,
	);
	const allProducts = everyVersion.filter((product) => !product.archived);

	return { latestProducts, allProducts };
};
