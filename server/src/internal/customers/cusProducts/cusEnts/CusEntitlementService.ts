import type { UpdateCustomerEntitlement } from "@autumn/shared";
import {
	type AppEnv,
	type CusProduct,
	CusProductStatus,
	type Customer,
	type CustomerEntitlement,
	customerEntitlements,
	customerPrices,
	customerProducts,
	customers,
	ErrCode,
	entitlements,
	type FullCusEntWithProduct,
	type FullCustomerEntitlement,
	features,
	type InsertCustomerEntitlement,
	prices,
	products,
	type ResetCusEnt,
} from "@autumn/shared";
import { and, eq, gt, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { StatusCodes } from "http-status-codes";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RepoContext } from "@/db/repoContext";
import { redis } from "@/external/redis/initRedis.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import RecaseError from "@/utils/errorUtils.js";

export class CusEntService {
	static async get({
		ctx,
		externalId,
		internalCustomerId,
	}: {
		ctx: RepoContext;
		externalId: string;
		internalCustomerId?: string;
	}) {
		const { db, org, env } = ctx;
		const rows = await db
			.select()
			.from(customerEntitlements)
			.innerJoin(
				customers,
				eq(customerEntitlements.internal_customer_id, customers.internal_id),
			)
			.where(
				and(
					eq(customerEntitlements.external_id, externalId),
					internalCustomerId
						? eq(customerEntitlements.internal_customer_id, internalCustomerId)
						: undefined,
					eq(customers.org_id, org.id),
					eq(customers.env, env),
				),
			)
			.limit(1);

		const cusEnt = rows[0]?.customer_entitlements;

		return cusEnt as CustomerEntitlement | undefined;
	}

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
		data:
			| InsertCustomerEntitlement[]
			| FullCustomerEntitlement[]
			| CustomerEntitlement[];
	}) {
		const { db } = ctx;
		if (Array.isArray(data) && data.length === 0) {
			return;
		}

		const insertData = data.map((item) => ({
			...item,
			balance: item.balance ?? 0,
			cache_version: 0,
		})) satisfies InsertCustomerEntitlement[];

		await db.insert(customerEntitlements).values(insertData);
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

		// Shared projection across all three UNION ALL branches. Keeping the
		// column list identical across branches is required for UNION ALL and
		// lets the existing mapper below consume each row uniformly.
		const baseSelect = {
			customer_entitlements: customerEntitlements,
			entitlements: entitlements,
			features: features,
			customers: customers,
			customer_products: customerProducts,
		};

		// Common reset predicates applied in every branch: next_reset_at has
		// passed and the entitlement has not expired.
		const commonResetPredicates = () =>
			and(
				lt(customerEntitlements.next_reset_at, customDateUnix ?? Date.now()),
				or(
					isNull(customerEntitlements.expires_at),
					gt(customerEntitlements.expires_at, customDateUnix ?? Date.now()),
				),
			);

		// Exclude price-backed cusEnts: their reset is owned by the Stripe
		// invoice.created handler, not this cron. Must stay in sync with
		// `cusEntToCusPrice` (shared/utils/cusEntUtils/.../cusEntToCusPrice.ts)
		// and the in-memory `getResettableCustomerEntitlements` filter.
		// Only applies to branches with `customer_product_id` set (i.e. 2 + 3).
		const notPriceBacked = () =>
			notExists(
				db
					.select({ one: sql`1` })
					.from(customerPrices)
					.innerJoin(prices, eq(prices.id, customerPrices.price_id))
					.where(
						and(
							sql`${customerPrices.customer_product_id} COLLATE "C" = ${customerEntitlements.customer_product_id}`,
							eq(prices.entitlement_id, customerEntitlements.entitlement_id),
						),
					),
			);

		// Exclude free cusEnts whose interval matches a subscription-backed
		// price on the same customer AND resets on the same day-of-month.
		// Mirrors isWebhookOwned + isAlignedWithWebhookCycle logic.
		// LEFT JOIN to ce_sub so that missing entitlement rows (e.g. fixed
		// prices) still match — null ce_sub means "assume aligned."
		// Interval normalization: month×3→quarter, month×6→semi_annual.
		const notWebhookOwned = () =>
			notExists(
				db
					.select({ one: sql`1` })
					.from(sql`customer_products cp_sub`)
					.innerJoin(
						sql`customer_prices cpr_sub`,
						sql`cpr_sub.customer_product_id = cp_sub.id`,
					)
					.innerJoin(
						sql`prices p_sub`,
						sql`p_sub.id = cpr_sub.price_id`,
					)
					.leftJoin(
						sql`customer_entitlements ce_sub`,
						sql`ce_sub.customer_product_id = cp_sub.id AND ce_sub.entitlement_id = p_sub.entitlement_id`,
					)
					.where(
						sql`cp_sub.internal_customer_id = ${customerEntitlements.internal_customer_id}
							AND cp_sub.status = 'active'
							AND cp_sub.subscription_ids IS NOT NULL
							AND array_length(cp_sub.subscription_ids, 1) > 0
							AND (p_sub.config->>'interval') != 'one_off'
							AND (
								CASE
									WHEN (p_sub.config->>'interval') = 'month' AND COALESCE((p_sub.config->>'interval_count')::int, 1) = 3 THEN 'quarter'
									WHEN (p_sub.config->>'interval') = 'month' AND COALESCE((p_sub.config->>'interval_count')::int, 1) = 6 THEN 'semi_annual'
									ELSE (p_sub.config->>'interval')
								END
							) = ${entitlements.interval}
							AND (
								CASE
									WHEN (p_sub.config->>'interval') = 'month' AND COALESCE((p_sub.config->>'interval_count')::int, 1) IN (3, 6) THEN 1
									ELSE COALESCE((p_sub.config->>'interval_count')::int, 1)
								END
							) = COALESCE(${entitlements.interval_count}::int, 1)
							AND (
								ce_sub.next_reset_at IS NULL
								OR EXTRACT(DAY FROM to_timestamp(${customerEntitlements.next_reset_at} / 1000.0))
								 = EXTRACT(DAY FROM to_timestamp(ce_sub.next_reset_at / 1000.0))
							)`,
					),
			);

		while (hasMore) {
			// Branch 1: cusEnts with no customer_product. Left-join to
			// customer_products on a false predicate so the row shape matches
			// the other branches (customer_products columns come back NULL).
			const branch1 = db
				.select(baseSelect)
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
				.leftJoin(customerProducts, sql`false`)
				.where(
					and(
						isNull(customerEntitlements.customer_product_id),
						commonResetPredicates(),
					),
				);

			// Branch 2: cusEnts on active customer_products.
			const branch2 = db
				.select(baseSelect)
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
				.innerJoin(
					customerProducts,
					sql`${customerEntitlements.customer_product_id} COLLATE "C" = ${customerProducts.id}`,
				)
				.where(
					and(
						eq(customerProducts.status, CusProductStatus.Active),
						commonResetPredicates(),
						notPriceBacked(),
						notWebhookOwned(),
					),
				);

			// Branch 3: cusEnts on past_due customer_products whose product
			// opted into ignore_past_due via products.config.
			const branch3 = db
				.select(baseSelect)
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
				.innerJoin(
					customerProducts,
					sql`${customerEntitlements.customer_product_id} COLLATE "C" = ${customerProducts.id}`,
				)
				.innerJoin(
					products,
					eq(customerProducts.internal_product_id, products.internal_id),
				)
				.where(
					and(
						eq(customerProducts.status, CusProductStatus.PastDue),
						sql`(${products.config}->>'ignore_past_due')::boolean = true`,
						commonResetPredicates(),
						notPriceBacked(),
						notWebhookOwned(),
					),
				);

			const data = await unionAll(branch1, branch2, branch3)
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
		incrementCacheVersion = true,
	}: {
		ctx: RepoContext;
		id: string;
		updates: Partial<InsertCustomerEntitlement>;
		incrementCacheVersion?: boolean;
	}) {
		const { db } = ctx;

		const data = await db
			.update(customerEntitlements)
			.set({
				...updates,
				cache_version: incrementCacheVersion
					? sql`${customerEntitlements.cache_version} + 1`
					: undefined,
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
