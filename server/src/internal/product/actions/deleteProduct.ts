import { ProductNotFoundError, products, RecaseError } from "@autumn/shared";
import { and, desc, eq, lt } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { ProductService } from "@/internal/products/ProductService.js";

const relinkVariantsBeforeDeletingBase = async ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: Awaited<ReturnType<typeof ProductService.get>>;
}) => {
	if (!product || product.base_internal_product_id !== null) return;

	const previousBase = await ctx.db.query.products.findFirst({
		where: and(
			eq(products.id, product.id),
			eq(products.org_id, product.org_id),
			eq(products.env, product.env),
			lt(products.version, product.version),
		),
		orderBy: [desc(products.version)],
	});

	await ctx.db
		.update(products)
		.set({ base_internal_product_id: previousBase?.internal_id ?? null })
		.where(
			and(
				eq(products.org_id, product.org_id),
				eq(products.env, product.env),
				eq(products.base_internal_product_id, product.internal_id),
			),
		);
};

export const deleteProduct = async ({
	ctx,
	productId,
	allVersions = false,
	version,
}: {
	ctx: AutumnContext;
	productId: string;
	allVersions?: boolean;
	version?: number;
}) => {
	const { db, org, env } = ctx;

	const product = await ProductService.get({
		db,
		id: productId,
		orgId: org.id,
		env,
		version,
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
		await relinkVariantsBeforeDeletingBase({ ctx, product });
		await ProductService.deleteByInternalId({
			db,
			internalId: product.internal_id,
			orgId: org.id,
			env,
		});
	}

	return { success: true };
};
