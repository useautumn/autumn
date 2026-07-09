import {
	type FullProduct,
	mapToProductV2,
	ProductNotFoundError,
	type ProductV2,
	type RewardProgram,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerProductVersioningUsage } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { rewardProgramRepo } from "@/internal/rewards/repos/index.js";

export type UpdateProductContext = {
	fullProduct: FullProduct;
	baseBeforeUpdate: FullProduct;
	currentProductV2: ProductV2;
	rewardPrograms: RewardProgram[];
	customerUsage: CustomerProductVersioningUsage;
};

export const setupUpdateProductContext = async ({
	ctx,
	productId,
	version,
	initialFullProduct,
}: {
	ctx: AutumnContext;
	productId: string;
	version?: number;
	initialFullProduct?: FullProduct;
}): Promise<UpdateProductContext> => {
	const { db, org, env, features } = ctx;
	const getFullProduct = async () => {
		if (initialFullProduct) return initialFullProduct;
		return ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
			version,
		});
	};

	const [fullProduct, rewardPrograms] = await Promise.all([
		getFullProduct(),
		rewardProgramRepo.getByProductId({
			db,
			productIds: [productId],
			orgId: org.id,
			env,
		}),
	]);

	if (!fullProduct) throw new ProductNotFoundError({ productId });

	const customerUsage = await customerProductRepo.getVersioningUsageForProduct({
		db,
		internalProductId: fullProduct.internal_id,
	});

	return {
		fullProduct,
		baseBeforeUpdate: structuredClone(fullProduct) as FullProduct,
		currentProductV2: mapToProductV2({
			product: fullProduct,
			features,
		}),
		rewardPrograms,
		customerUsage,
	};
};
