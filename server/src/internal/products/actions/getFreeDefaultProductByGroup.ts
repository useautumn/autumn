import { isFreeProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { ProductService } from "@/internal/products/ProductService";

export const getFreeDefaultProductByGroup = async ({
	ctx,
	productGroup,
}: {
	ctx: AutumnContext;
	productGroup: string;
}) => {
	const { db, org, env } = ctx;
	const defaultProducts = await ProductService.listDefault({
		db,
		orgId: org.id,
		group: productGroup,
		env,
	});

	return defaultProducts.find((p) => isFreeProduct({ prices: p.prices }));
};
