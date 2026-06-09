import {
	type AppEnv,
	customerProducts,
	type CreateReward,
	type CreateRewardProgram,
	isUsagePrice,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { eq } from "drizzle-orm";

export const createProduct = async ({
	db,
	orgId,
	env,
	autumn,
	product,
	prefix,
	createInStripe,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	autumn: AutumnInt;
	product: any;
	prefix?: string;
	createInStripe?: boolean;
}) => {
	try {
		const products = await ProductService.listFull({
			db,
			orgId,
			env,
			returnAll: true,
			inIds: [product.id],
		});

		// customer_products_internal_product_id_fkey has no ON DELETE CASCADE.
		// Wipe referencing rows first so the product delete succeeds.
		for (const prod of products) {
			await db
				.delete(customerProducts)
				.where(eq(customerProducts.internal_product_id, prod.internal_id));
		}

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
		console.error("Error deleting product", error);
		// Ignore deletion errors (might have customers attached)
	}

	const clone = structuredClone(product);
	if (typeof clone.items === "object") {
		clone.items = Object.values(clone.items);
	}

	if (prefix) {
		clone.id = `${prefix}_${clone.id}`;
		clone.name = `${clone.name} ${prefix}`;
	}

	if (createInStripe === false) {
		clone.create_in_stripe = false;
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
	createInStripe,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	autumn: AutumnInt;
	products: any[];
	prefix?: string;
	customerId?: string;
	createInStripe?: boolean;
}) => {
	if (customerId) {
		try {
			await autumn.customers.delete(customerId);
		} catch (error) {}
	}

	const batchCreate = [];
	for (const product of products) {
		batchCreate.push(
			createProduct({ db, orgId, env, autumn, product, prefix, createInStripe }),
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
	productId?: string;
	onlyUsage?: boolean;
}) => {
	// Only fetch product if we need usage prices
	if (onlyUsage && productId) {
		const fullProduct = await ProductService.getFull({
			db,
			orgId,
			env,
			idOrInternalId: productId,
		});

		const usagePrices = fullProduct?.prices.filter((price) =>
			isUsagePrice({ price }),
		);

		reward.discount_config!.price_ids = usagePrices?.map((price) => price.id);
	} else if (productId) {
		const fullProduct = await ProductService.getFull({
			db,
			orgId,
			env,
			idOrInternalId: productId,
		});

		reward.discount_config!.price_ids =
			fullProduct?.prices.map((p) => p.id) ?? [];
	}

	try {
		await autumn.rewards.delete(reward.id);
	} catch (error) {}

	await autumn.rewards.create(reward);
};

export const createReferralProgram = async ({
	db,
	orgId,
	env,
	autumn,
	reward,
	rewardProgram,
	productId,
	onlyUsage = false,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	autumn: AutumnInt;
	reward: CreateReward;
	rewardProgram: CreateRewardProgram;
	productId?: string;
	onlyUsage?: boolean;
}) => {
	// Create reward first
	await createReward({
		db,
		orgId,
		env,
		autumn,
		reward,
		productId,
		onlyUsage,
	});

	// Create referral program (will fail if already exists, but that's ok)
	try {
		await autumn.rewardPrograms.create(rewardProgram);
	} catch (error: any) {
		// If program already exists (race condition), silently continue
		if (
			error?.message?.includes("already exists") ||
			error?.message?.includes("duplicate") ||
			error?.code === "REWARD_PROGRAM_EXISTS"
		) {
			return;
		}
		throw error;
	}
};
