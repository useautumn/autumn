import type { UpdateCustomerEntitlement } from "@autumn/shared";
import {
	type AppEnv,
	type CusProduct,
	CusProductStatus,
	type Customer,
	type CustomerEntitlement,
	customerEntitlements,
	customerProducts,
	customers,
	ErrCode,
	entitlements,
	type FullCusEntWithProduct,
	type FullCustomerEntitlement,
	features,
	type InsertCustomerEntitlement,
	type ResetCusEnt,
} from "@autumn/shared";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RepoContext } from "@/db/repoContext";
import { redis } from "@/external/redis/initRedis.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import RecaseError from "@/utils/errorUtils.js";

export class CusEntService {
	static async upsert({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: CustomerEntitlement[];
	}) {
		if (Array.isArray(data) && data.length === 0) return;

		const updateColumns = buildConflictUpdateColumns(customerEntitlements, [
			"id",
		]);
		await db
			.insert(customerEntitlements)
			.values(data as any)
			.onConflictDoUpdate({
				target: customerEntitlements.id,
				set: updateColumns,
			});
	}

	static async getByIds({ db, ids }: { db: DrizzleCli; ids: string[] }) {
		if (ids.length === 0) return [];

		const data = await db
			.select()
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.id, ids));

		return data as CustomerEntitlement[];
	}

	static async getByFeature({
		db,
		internalFeatureId,
		internalCustomerId,
	}: {
		db: DrizzleCli;
		internalFeatureId: string;
		internalCustomerId?: string;
	}) {
		const data = await db
			.select()
			.from(customerEntitlements)
			.where(
				internalCustomerId
					? and(
							eq(customerEntitlements.internal_feature_id, internalFeatureId),
							eq(customerEntitlements.internal_customer_id, internalCustomerId),
						)
					: eq(customerEntitlements.internal_feature_id, internalFeatureId),
			)
			.limit(10);

		return data as FullCustomerEntitlement[];
	}

	static async insert({
		ctx,
		data,
	}: {
		ctx: RepoContext;
		data: InsertCustomerEntitlement[] | FullCustomerEntitlement[];
	}) {
		const { db } = ctx;
		if (Array.isArray(data) && data.length === 0) {
			return;
		}

		await db.insert(customerEntitlements).values(data as any); // DRIZZLE TYPE REFACTOR
	}

	static async getActiveResetPassed({
		db,
		customDateUnix,
		batchSize = 1000,
		limit,
	}: {
		db: DrizzleCli;
		customDateUnix?: number;
		batchSize?: number;
		limit?: number;
	}) {
		const allResults: FullCusEntWithProduct[] = [];
		let offset = 0;
		let hasMore = true;

		while (hasMore) {
			const data = await db
				.select()
				.from(customerEntitlements)
				.innerJoin(
					entitlements,
					eq(customerEntitlements.entitlement_id, entitlements.id),
				)
				.innerJoin(
					features,
					eq(entitlements.internal_feature_id, features.internal_id),
				)
				.innerJoin(
					customers,
					eq(customerEntitlements.internal_customer_id, customers.internal_id),
				)
				.leftJoin(
					customerProducts,
					eq(customerEntitlements.customer_product_id, customerProducts.id),
				)
				.where(
					and(
						or(
							isNull(customerEntitlements.customer_product_id),
							eq(customerProducts.status, CusProductStatus.Active),
						),
						lt(
							customerEntitlements.next_reset_at,
							customDateUnix ?? Date.now(),
						),

						// Customer entitlement has not expired
						or(
							isNull(customerEntitlements.expires_at),
							gt(customerEntitlements.expires_at, Date.now()),
						),
					),
				)
				.limit(batchSize)
				.offset(offset);

			if (data.length === 0 || (limit && allResults.length >= limit)) {
				hasMore = false;
			} else {
				const mappedData = data.map((item) => ({
					...item.customer_entitlements,
					entitlement: {
						...item.entitlements,
						feature: item.features,
					},
					customer_product: item.customer_products,
					customer: item.customers,
					replaceables: [],
					rollovers: [],
				})) as ResetCusEnt[];

				allResults.push(...mappedData);
				offset += batchSize;
				hasMore = data.length === batchSize;
				console.log(`Fetched ${allResults.length} entitlements to reset`);
			}
		}

		return allResults as ResetCusEnt[];
	}

	static async update({
		ctx,
		id,
		updates,
	}: {
		ctx: RepoContext;
		id: string;
		updates: Partial<InsertCustomerEntitlement>;
	}) {
		const { db } = ctx;

		const data = await db
			.update(customerEntitlements)
			.set({
				...updates,
				cache_version: sql`${customerEntitlements.cache_version} + 1`,
			})
			.where(eq(customerEntitlements.id, id))
			.returning();

		return data;
	}

	static async syncUpdateToCache({
		ctx,
		cusEntId,
		updates,
	}: {
		ctx: RepoContext;
		cusEntId: string;
		updates: Partial<InsertCustomerEntitlement>;
	}) {
		const { org, env, customerId } = ctx;

		if (!customerId) {
			ctx.logger.warn(
				`skipping cusEnt sync update to cache, customerId not known`,
			);
			return;
		}

		const cacheKey = buildFullCustomerCacheKey({
			orgId: org.id,
			env,
			customerId: customerId ?? "",
		});

		const cacheUpdates = [
			{
				cus_ent_id: cusEntId,
				balance: updates.balance ?? null,
				additional_balance: updates.additional_balance ?? null,
				adjustment: updates.adjustment ?? null,
				entities: updates.entities ?? null,
				next_reset_at: updates.next_reset_at ?? null,
				expected_next_reset_at: null,
				rollover_insert: null,
				rollover_overwrites: null,
				rollover_delete_ids: null,
				new_replaceables: null,
				deleted_replaceable_ids: null,
			},
		];

		await tryRedisWrite(() =>
			redis.updateCustomerEntitlements(
				cacheKey,
				JSON.stringify({ updates: cacheUpdates }),
			),
		);
	}

	static async batchUpdate({
		ctx,
		data,
	}: {
		ctx: RepoContext;
		data: UpdateCustomerEntitlement[];
	}) {
		if (Array.isArray(data) && data.length === 0) {
			return;
		}

		const updatePromises = [];
		for (const { customerEntitlement, updates } of data) {
			if (Object.keys(updates ?? {}).length === 0) {
				continue;
			}

			updatePromises.push(
				CusEntService.update({
					ctx,
					id: customerEntitlement.id,
					updates: updates as Partial<InsertCustomerEntitlement>,
				}),
			);
		}
		await Promise.all(updatePromises);
	}

	static async getStrict({
		db,
		id,
		orgId,
		env,
		withCusProduct,
	}: {
		db: DrizzleCli;
		id: string;
		orgId: string;
		env: AppEnv;
		withCusProduct?: boolean;
	}) {
		const data = await db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, id),
			with: {
				entitlement: {
					with: {
						feature: true,
					},
				},
				replaceables: true,
				rollovers: true,
				customer_product: withCusProduct || undefined,
				customer: true,
			},
		});

		if (
			!data ||
			!data.customer ||
			data.customer.org_id !== orgId ||
			data.customer.env !== env
		) {
			throw new RecaseError({
				message: "Customer entitlement not found",
				code: ErrCode.CustomerEntitlementNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		return data as FullCustomerEntitlement & {
			customer: Customer;
			customer_product?: CusProduct;
			// replaceables?: Replaceable[];
		};
	}

	static async increment({
		ctx,
		id,
		amount,
	}: {
		ctx: RepoContext;
		id: string;
		amount: number;
	}) {
		const { db } = ctx;
		const data = await db
			.update(customerEntitlements)
			.set({
				balance: sql`${customerEntitlements.balance} + ${amount}`,
				cache_version: sql`${customerEntitlements.cache_version} + 1`,
			})
			.where(eq(customerEntitlements.id, id))
			.returning();

		return data;
	}

	static async decrement({
		ctx,
		id,
		amount,
	}: {
		ctx: RepoContext;
		id: string;
		amount: number;
	}) {
		const { db } = ctx;

		const data = await db
			.update(customerEntitlements)
			.set({
				balance: sql`${customerEntitlements.balance} - ${amount}`,
				cache_version: sql`${customerEntitlements.cache_version} + 1`,
			})
			.where(eq(customerEntitlements.id, id))
			.returning();

		return data;
	}

	static async delete({ db, id }: { db: DrizzleCli; id: string }) {
		await db
			.delete(customerEntitlements)
			.where(eq(customerEntitlements.id, id));
	}
}
