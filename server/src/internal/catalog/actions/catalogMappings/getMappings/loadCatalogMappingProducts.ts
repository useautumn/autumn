import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const loadCatalogMappingProducts = async ({
	ctx,
}: {
	ctx: AutumnContext;
}) => {
	const { db, org, env } = ctx;

	const latestProducts = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		archived: false,
	});
	const allProducts = (
		await ProductService.listFull({
			db,
			orgId: org.id,
			env,
			returnAll: true,
		})
	).filter((product) => !product.archived);

	return { latestProducts, allProducts };
};
