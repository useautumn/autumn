import {
	AppEnv,
	CreateProductV2ParamsSchema,
	type Entitlement,
	type Feature,
	type Price,
	type Product,
	type ProductV2,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { constructProduct } from "@/internal/products/productUtils.js";

export const parseChatProducts = async ({
	db,
	logger,
	features,
	orgId,
	chatProducts,
}: {
	db: DrizzleCli;
	logger: any;
	features: Feature[];
	orgId: string;
	chatProducts: ProductV2[];
}) => {
	const products: Product[] = [];

	const allPrices: Price[] = [];
	const allEnts: Entitlement[] = [];

	for (const product of chatProducts) {
		const backendProduct: Product = constructProduct({
			productData: CreateProductV2ParamsSchema.parse({
				...product,
			}),
			orgId,
			env: AppEnv.Sandbox,
		});

		const { prices, entitlements } = await handleNewProductItems({
			db,
			curPrices: [],
			curEnts: [],
			newItems: product.items,
			product: backendProduct,
			features,
			saveToDb: false,
			isCustom: false,
			logger,
		});

		products.push(backendProduct);
		allPrices.push(...prices);

		allEnts.push(
			...entitlements.map((ent) => {
				return ent;
			}),
		);
	}

	return { products, prices: allPrices, ents: allEnts };
};
