import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { productRepo } from "@/internal/products/repos/productRepo.js";

export type StripeReuseFamilyProduct = {
	baseInternalProductId: string;
	product: FullProduct;
};

export const listStripeReuseFamilyProducts = async ({
	ctx,
	baseInternalProductIds,
	returnAll = false,
}: {
	ctx: AutumnContext;
	baseInternalProductIds: string[];
	returnAll?: boolean;
}): Promise<StripeReuseFamilyProduct[]> => {
	const familyIds = await productRepo.listStripeReuseFamilyIds({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		baseInternalProductIds,
		returnAll,
	});
	if (familyIds.length === 0) return [];

	const productIds = [...new Set(familyIds.map((row) => row.productId))];
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: productIds,
		returnAll,
	});
	const productsById = new Map<string, FullProduct[]>();
	for (const product of products) {
		const existing = productsById.get(product.id) ?? [];
		existing.push(product);
		productsById.set(product.id, existing);
	}

	return familyIds.flatMap((row) =>
		(productsById.get(row.productId) ?? []).map((product) => ({
			baseInternalProductId: row.baseInternalProductId,
			product,
		})),
	);
};
