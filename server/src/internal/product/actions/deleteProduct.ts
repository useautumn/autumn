import { ProductNotFoundError, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const deleteProduct = async ({
	ctx,
	productId,
	allVersions = false,
}: {
	ctx: AutumnContext;
	productId: string;
	allVersions?: boolean;
}) => {
	const { db, org, env } = ctx;

	const product = await ProductService.get({
		db,
		id: productId,
		orgId: org.id,
		env,
	});

	if (!product) {
		throw new ProductNotFoundError({ productId: productId });
	}

	const [latestCounts, allCounts] = await Promise.all([
		CusProdReadService.getCounts({
			db,
			internalProductId: product.internal_id,
		}),
		CusProdReadService.getCountsForAllVersions({
			db,
			productId: productId,
			orgId: org.id,
			env,
		}),
	]);

	const cusProdCount = allVersions ? allCounts.all : latestCounts.all;

	if (cusProdCount > 0) {
		throw new RecaseError({
			message: `Product ${productId} has ${cusProdCount} customers (expired or active) on it and therefore cannot be deleted`,
		});
	}

	if (allVersions) {
		await ProductService.deleteByProductId({
			db,
			productId: productId,
			orgId: org.id,
			env,
		});
	} else {
		await ProductService.deleteByInternalId({
			db,
			internalId: product.internal_id,
			orgId: org.id,
			env,
		});
	}

	return { success: true };
};
