import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getActiveProducts } from "@/internal/products/productUtils.js";

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

	const latestProducts = getActiveProducts(everyVersion).filter(
		(product) => !product.archived,
	);
	const allProducts = everyVersion.filter((product) => !product.archived);

	return { latestProducts, allProducts };
};
