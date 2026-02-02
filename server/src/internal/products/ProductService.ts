import {
	type AppEnv,
	customerProducts,
	customers,
	ErrCode,
	entitlements,
	type FullProduct,
	freeTrials,
	type Product,
	ProductNotFoundError,
	prices,
	products,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import RecaseError from "@server/utils/errorUtils";
import { notNullish } from "@server/utils/genUtils";
import {
	and,
	desc,
	eq,
	exists,
	inArray,
	isNull,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { queryWithCache } from "@/utils/cacheUtils/queryWithCache";
import { buildProductsCacheKey, PRODUCTS_CACHE_TTL } from "./productCacheUtils";
import { getLatestProducts } from "./productUtils";
import { sortFullProducts } from "./productUtils/sortProductUtils";

const parseFreeTrials = ({
	products,
	product,
}: {
	products?: FullProduct[];
	product?: FullProduct;
}) => {
	if (products) {
		for (const prod of products) {
			prod.free_trial =
				prod.free_trials && prod.free_trials.length > 0
					? prod.free_trials[0]
					: null;
		}
	} else if (product) {
		product!.free_trial =
			product!.free_trials && product!.free_trials.length > 0
				? product!.free_trials[0]
				: null;
	}
	return product;
};

export class ProductService {
	static async getByFeature({
		db,
		internalFeatureId,
	}: {
		db: DrizzleCli;
		internalFeatureId: string;
	}) {
		const fullProducts = (await db.query.products.findMany({
			where: exists(
				db
					.select()
					.from(entitlements)
					.where(
						and(
							eq(entitlements.internal_product_id, products.internal_id),
							eq(entitlements.internal_feature_id, internalFeatureId),
						),
					),
			),
			with: {
				entitlements: {
					with: {
						feature: true,
					},
				},
				prices: { where: eq(prices.is_custom, false) },
				free_trials: { where: eq(freeTrials.is_custom, false) },
			},
			orderBy: [desc(products.version)],
		})) as FullProduct[];

		parseFreeTrials({ products: fullProducts });

		const latestProducts = getLatestProducts(fullProducts);

		return latestProducts;
	}

	static async getByInternalId({
		db,
		internalId,
	}: {
		db: DrizzleCli;
		internalId: string;
	}) {
		return (await db.query.products.findFirst({
			where: eq(products.internal_id, internalId),
		})) as Product;
	}

	static async listByInternalIds({
		db,
		internalIds,
	}: {
		db: DrizzleCli;
		internalIds: string[];
	}) {
		return (await db.query.products.findMany({
			where: inArray(products.internal_id, internalIds),
			with: {
				entitlements: {
					with: {
						feature: true,
					},
				},
				prices: { where: eq(prices.is_custom, false) },
			},
		})) as FullProduct[];
	}

	static async listDefault({
		db,
		orgId,
		env,
		group,
		inIds,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		group?: string;
		inIds?: string[];
	}) {
		const prods = (await db.query.products.findMany({
			where: and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				eq(products.is_default, true),
				ne(products.archived, true),
				group === "" || group === null
					? or(isNull(products.group), eq(products.group, ""))
					: notNullish(group)
						? eq(products.group, group)
						: undefined,
				inIds ? inArray(products.id, inIds) : undefined,
			),
			with: {
				entitlements: {
					with: {
						feature: true,
					},
					where: eq(entitlements.is_custom, false),
				},
				prices: { where: eq(prices.is_custom, false) },
				free_trials: { where: eq(freeTrials.is_custom, false) },
			},
		})) as FullProduct[];

		parseFreeTrials({ products: prods });

		const latestProducts = getLatestProducts(prods);

		return latestProducts as FullProduct[];
	}

	static async insert({ db, product }: { db: DrizzleCli; product: Product }) {
		const prod = await db.insert(products).values(product).returning();

		if (!prod || prod.length === 0) {
			throw new RecaseError({
				message: "Failed to create product",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
			});
		}

		return prod[0] as Product;
	}

	static async get({
		db,
		id,
		orgId,
		env,
		version,
	}: {
		db: DrizzleCli;
		id: string;
		orgId: string;
		env: AppEnv;
		version?: number;
	}) {
		return await db.query.products.findFirst({
			where: and(
				eq(products.id, id),
				eq(products.org_id, orgId),
				eq(products.env, env),
				version ? eq(products.version, version) : undefined,
			),
			orderBy: [desc(products.version)],
		});
	}

	static async listFull({
		db,
		orgId,
		env,
		inIds,
		returnAll = false,
		version,
		excludeEnts = false,
		archived,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		inIds?: string[];
		returnAll?: boolean;
		version?: number;
		excludeEnts?: boolean;
		archived?: boolean;
	}): Promise<FullProduct[]> {
		// Use caching for simple queries (no inIds, returnAll, version, or excludeEnts)
		const canCache = !inIds && !returnAll && !version && !excludeEnts;

		if (canCache) {
			return queryWithCache({
				key: buildProductsCacheKey({
					orgId,
					env,
					queryParams: { archived },
				}),
				ttl: PRODUCTS_CACHE_TTL,
				fn: () => ProductService._listFullQuery({ db, orgId, env, archived }),
			});
		}

		return ProductService._listFullQuery({
			db,
			orgId,
			env,
			inIds,
			returnAll,
			version,
			excludeEnts,
			archived,
		});
	}

	private static async _listFullQuery({
		db,
		orgId,
		env,
		inIds,
		returnAll = false,
		version,
		excludeEnts = false,
		archived,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		inIds?: string[];
		returnAll?: boolean;
		version?: number;
		excludeEnts?: boolean;
		archived?: boolean;
	}): Promise<FullProduct[]> {
		// Optimization: Use a subquery to only fetch the latest version of each product
		const latestVersionsSubquery =
			!returnAll && !version
				? db
						.select({
							id: products.id,
							maxVersion: sql<number>`MAX(${products.version})`.as(
								"max_version",
							),
						})
						.from(products)
						.where(
							and(
								eq(products.org_id, orgId),
								eq(products.env, env),
								inIds ? inArray(products.id, inIds) : undefined,
							),
						)
						.groupBy(products.id)
						.as("latest_versions")
				: undefined;

		const data = (await db.query.products.findMany({
			where: and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				inIds ? inArray(products.id, inIds) : undefined,
				version ? eq(products.version, version) : undefined,
				latestVersionsSubquery
					? exists(
							db
								.select()
								.from(latestVersionsSubquery)
								.where(
									and(
										eq(latestVersionsSubquery.id, products.id),
										eq(latestVersionsSubquery.maxVersion, products.version),
									),
								),
						)
					: undefined,
			),
			with: {
				entitlements: excludeEnts
					? undefined
					: {
							with: {
								feature: true,
							},
							where: eq(entitlements.is_custom, false),
						},
				prices: { where: eq(prices.is_custom, false) },
				free_trials: { where: eq(freeTrials.is_custom, false) },
			},
		})) as FullProduct[];

		parseFreeTrials({ products: data });

		if (returnAll) {
			return data;
		}

		const latestProducts: FullProduct[] = getLatestProducts(data);

		if (inIds) {
			const newProducts: FullProduct[] = [];
			for (const id of inIds) {
				const prod = latestProducts.find((prod) => prod.id === id);
				if (!prod) {
					throw new ProductNotFoundError({ productId: id });
				}
				newProducts.push(prod);
			}
			return newProducts;
		}

		const result = notNullish(archived)
			? latestProducts.filter((p) => p.archived === archived)
			: latestProducts;

		sortFullProducts({ products: result });
		return result;
	}

	static async getFull({
		db,
		idOrInternalId,
		orgId,
		env,
		version,
		allowNotFound = false,
	}: {
		db: DrizzleCli;
		idOrInternalId: string;
		orgId: string;
		env: AppEnv;
		version?: number;
		allowNotFound?: boolean;
	}) {
		const data = (await db.query.products.findFirst({
			where: and(
				or(
					eq(products.id, idOrInternalId),
					eq(products.internal_id, idOrInternalId),
				),
				eq(products.org_id, orgId),
				eq(products.env, env),
				version ? eq(products.version, version) : undefined,
			),
			orderBy: [desc(products.version)],
			with: {
				entitlements: {
					with: {
						feature: true,
					},
					where: eq(entitlements.is_custom, false),
				},
				prices: { where: eq(prices.is_custom, false) },
				free_trials: { where: eq(freeTrials.is_custom, false) },
			},
		})) as FullProduct;

		parseFreeTrials({ product: data });

		if (!data) {
			if (allowNotFound) return null as unknown as FullProduct;
			throw new ProductNotFoundError({ productId: idOrInternalId, version });
		}

		return data as FullProduct;
	}

	static async getProductVersionCount({
		db,
		productId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		productId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const data = await db.query.products.findMany({
			columns: {
				version: true,
			},
			limit: 1,
			where: and(
				eq(products.id, productId),
				eq(products.org_id, orgId),
				eq(products.env, env),
			),
			orderBy: [desc(products.version)],
		});

		if (data.length === 0) {
			throw new ProductNotFoundError({ productId: productId });
		}

		return data[0].version;
	}

	// UPDATES
	static async updateByInternalId({
		db,
		internalId,
		update,
	}: {
		db: DrizzleCli;
		internalId: string;
		update: any;
	}) {
		await db
			.update(products)
			.set(update)
			.where(eq(products.internal_id, internalId));
	}

	// DELETES

	static async deleteByInternalId({
		db,
		internalId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		internalId: string;
		orgId: string;
		env: AppEnv;
	}) {
		await db
			.delete(products)
			.where(
				and(
					eq(products.internal_id, internalId),
					eq(products.org_id, orgId),
					eq(products.env, env),
				),
			);
	}

	static async deleteByProductId({
		db,
		productId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		productId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const res = await db
			.select()
			.from(products)
			.where(
				and(
					eq(products.id, productId),
					eq(products.org_id, orgId),
					eq(products.env, env),
				),
			);

		const internalIds = res.map((r) => r.internal_id);

		if (internalIds.length === 0) return;
		if (internalIds.length > 500) {
			throw new RecaseError({
				message: "Cannot delete more than 500 products at once",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
			});
		}

		await db.delete(products).where(inArray(products.internal_id, internalIds));
	}

	static async deleteByOrgId({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}) {
		await db
			.delete(products)
			.where(and(eq(products.org_id, orgId), eq(products.env, env)));
	}

	static async getDeletionText({
		db,
		productId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		productId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const internalProductIds = (
			await db
				.select({
					internal_product_id: products.internal_id,
				})
				.from(products)
				.where(
					and(
						eq(products.id, productId),
						eq(products.org_id, orgId),
						eq(products.env, env),
					),
				)
		).map((r) => r.internal_product_id);

		const res = await db
			.select({
				internal_customer_id: customerProducts.internal_customer_id,
				name: customers.name,
				id: customers.id,
				email: customers.email,
				totalCount: sql<number>`COUNT(*) OVER ()`,
			})
			.from(customerProducts)
			.innerJoin(
				customers,
				eq(customerProducts.internal_customer_id, customers.internal_id),
			)
			.where(
				and(
					inArray(customerProducts.internal_product_id, internalProductIds),
					eq(customers.env, env),
					eq(customers.org_id, orgId),
				),
			)
			.orderBy(desc(customers.created_at))
			.groupBy(
				customerProducts.internal_customer_id,
				customers.name,
				customers.created_at,
				customers.id,
				customers.email,
			);
		// .limit(1);

		return res;
	}
}
