import { type AppEnv, type CreateReward, isUsagePrice } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const createProduct = async ({
	db,
	orgId,
	env,
	autumn,
	product,
	prefix,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	autumn: AutumnInt;
	product: any;
	prefix?: string;
}) => {
	try {
		const products = await ProductService.listFull({
			db,
			orgId,
			env,
			returnAll: true,
			inIds: [product.id],
		});

		const batchDelete = [];
		for (const prod of products) {
			batchDelete.push(
				ProductService.deleteByInternalId({
					db,
					internalId: prod.internal_id,
					orgId,
					env,
				}),
			);
		}

		await Promise.all(batchDelete);
	} catch (error) {
		// Ignore deletion errors (might have customers attached)
	}

	const clone = structuredClone(product);
	if (typeof clone.items === "object") {
		clone.items = Object.values(clone.items);
	}

	if (prefix) {
		clone.id = `${prefix}_${clone.id}`;
		clone.name = `${prefix} ${clone.name}`;
	}

	try {
		await autumn.products.create(clone);
	} catch (error: any) {
		// If product already exists (race condition), silently continue
		if (
			error?.message?.includes("already exists") ||
			error?.message?.includes("duplicate") ||
			error?.code === "PRODUCT_EXISTS"
		) {
			return;
		}
		throw error;
	}
};

export const createProducts = async ({
	db,
	orgId,
	env,
	autumn,
	products,
	prefix,
	customerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	autumn: AutumnInt;
	products: any[];
	prefix?: string;
	customerId?: string;
}) => {
	if (customerId) {
		try {
			await autumn.customers.delete(customerId);
		} catch (error) {}
	}

	const batchCreate = [];
	for (const product of products) {
		batchCreate.push(
			createProduct({ db, orgId, env, autumn, product, prefix }),
		);
	}

	await Promise.all(batchCreate);
};

export const createReward = async ({
	db,
	orgId,
	env,
	autumn,
	reward,
	productId,
	onlyUsage = false,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	autumn: AutumnInt;
	reward: CreateReward;
	productId: string;
	onlyUsage?: boolean;
}) => {
	const fullProduct = await ProductService.getFull({
		db,
		orgId,
		env,
		idOrInternalId: productId!,
	});

	const usagePrices = fullProduct?.prices.filter((price) =>
		isUsagePrice({ price }),
	);

	if (onlyUsage) {
		reward.discount_config!.price_ids = usagePrices?.map((price) => price.id);
	}

	try {
		await autumn.rewards.delete(reward.id);
	} catch (error) {}

	await autumn.rewards.create(reward);
};
