import type { UpdateCustomerEntitlement } from "@autumn/shared";
import {
	type AppEnv,
	type CusProduct,
	CusProductStatus,
	type Customer,
	type CustomerEntitlement,
	customerEntitlements,
	customerLicenses,
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
import {
	and,
	eq,
	gt,
	inArray,
	isNull,
	lt,
	notExists,
	or,
	sql,
} from "drizzle-orm";
import { alias, unionAll } from "drizzle-orm/pg-core";
import { StatusCodes } from "http-status-codes";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RepoContext } from "@/db/repoContext";
import { redis } from "@/external/redis/initRedis.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import RecaseError from "@/utils/errorUtils.js";

export class CusEntService {
	/** Whether any customer entitlement references one of these catalog rows. */
	static async hasAnyEntitlementReferences({
		db,
		entitlementIds,
	}: {
		db: DrizzleCli;
		entitlementIds: string[];
	}): Promise<boolean> {
		if (entitlementIds.length === 0) return false;
		const row = await db
			.select({ id: customerEntitlements.id })
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.entitlement_id, entitlementIds))
			.limit(1);
		return row.length > 0;
	}

	/**
	 * Which of these catalog entitlements are referenced by any
	 * customer_entitlements row — across every status, including loose,
	 * scheduled and canceled.
	 */
	static async getReferencedEntitlementIds({
		db,
		entitlementIds,
	}: {
		db: DrizzleCli;
		entitlementIds: string[];
	}): Promise<Set<string>> {
		if (entitlementIds.length === 0) return new Set();
		const rows = await db
			.select({ entitlement_id: customerEntitlements.entitlement_id })
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.entitlement_id, entitlementIds));
		return new Set(rows.map((row) => row.entitlement_id));
	}

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
							sql`${customerEntitlements.internal_feature_id} COLLATE "C" = ${internalFeatureId}`,
							eq(customerEntitlements.internal_customer_id, internalCustomerId),
						)
					: sql`${customerEntitlements.internal_feature_id} COLLATE "C" = ${internalFeatureId}`,
			)
			.limit(10);

		return data as unknown as FullCustomerEntitlement[];
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

	static buildActiveResetPassedPage({
		db,
		now,
		batchSize,
		cursor,
		includeSeparateIntervalResets,
	}: {
		db: DrizzleCli;
		now: number;
		batchSize: number;
		cursor: { nextResetAt: number; id: string } | null;
		includeSeparateIntervalResets: boolean;
	}) {
		// Sort keys are projected as top-level output columns because Postgres
		// only allows ORDER BY on a set operation via output column names.
		// Seat rows (license assignments) inherit lifecycle from their pool's
		// parent — one lateral probe per seat row; a NULL link matches nothing
		// so non-seat rows pay an empty index lookup.
		const makeParentLateral = () => {
			const pcl = alias(customerLicenses, "pcl");
			const pcp = alias(customerProducts, "pcp");
			return db
				.select({
					parent_status: pcp.status,
					parent_subscription_ids: pcp.subscription_ids,
				})
				.from(pcl)
				.innerJoin(pcp, eq(pcp.id, pcl.parent_customer_product_id))
				.where(
					sql`${pcl.link_id} = ${customerProducts.customer_license_link_id}`,
				)
				.limit(1)
				.as("parent_cp");
		};

		const makeBaseSelect = (
			parentLateral: ReturnType<typeof makeParentLateral>,
		) => ({
			customer_entitlements: customerEntitlements,
			entitlements: entitlements,
			features: features,
			customers: customers,
			customer_products: customerProducts,
			parent_status: parentLateral.parent_status,
			parent_subscription_ids: parentLateral.parent_subscription_ids,
			sort_reset: sql`${customerEntitlements.next_reset_at}`.as("sort_reset"),
			sort_id: sql`${customerEntitlements.id} COLLATE "C"`.as("sort_id"),
		});

		const effectiveStatus = (
			parentLateral: ReturnType<typeof makeParentLateral>,
		) =>
			sql`COALESCE(${parentLateral.parent_status}, ${customerProducts.status})`;

		const commonResetPredicates = () =>
			and(
				sql`${customerEntitlements.expired} IS NOT TRUE`,
				lt(customerEntitlements.next_reset_at, now),
				or(
					isNull(customerEntitlements.expires_at),
					gt(customerEntitlements.expires_at, now),
				),
			);

		// COLLATE "C" keeps the cursor comparison aligned with sort_id's ordering.
		const afterCursor = () =>
			cursor
				? sql`(${customerEntitlements.next_reset_at}, ${customerEntitlements.id} COLLATE "C") > (${cursor.nextResetAt}, ${cursor.id})`
				: undefined;

		// Exclude normal price-backed cusEnts: their reset is owned by the Stripe
		// invoice.created handler, not this cron. Must stay in sync with
		// `cusEntToCusPrice` and the in-memory `getResettableCustomerEntitlements`
		// filter. Only applies to branches with `customer_product_id` set (2 + 3).
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

		const resetOwnedByAutumn = () =>
			includeSeparateIntervalResets
				? or(eq(customerEntitlements.separate_interval, true), notPriceBacked())
				: notPriceBacked();

		// Branch 1: cusEnts with no customer_product. Left-join to
		// customer_products on a false predicate so the row shape matches
		// the other branches (customer_products columns come back NULL).
		const parentLateral1 = makeParentLateral();
		const branch1 = db
			.select(makeBaseSelect(parentLateral1))
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
			.leftJoinLateral(parentLateral1, sql`true`)
			.where(
				and(
					isNull(customerEntitlements.customer_product_id),
					commonResetPredicates(),
					afterCursor(),
				),
			);

		// Branch 2: cusEnts on active customer_products.
		const parentLateral2 = makeParentLateral();
		const branch2 = db
			.select(makeBaseSelect(parentLateral2))
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
			.leftJoinLateral(parentLateral2, sql`true`)
			.where(
				and(
					sql`${effectiveStatus(parentLateral2)} = ${CusProductStatus.Active}`,
					commonResetPredicates(),
					resetOwnedByAutumn(),
					afterCursor(),
				),
			);

		// Branch 3: cusEnts on past_due customer_products whose product
		// opted into ignore_past_due via products.config.
		const parentLateral3 = makeParentLateral();
		const branch3 = db
			.select(makeBaseSelect(parentLateral3))
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
			.leftJoinLateral(parentLateral3, sql`true`)
			.where(
				and(
					sql`${effectiveStatus(parentLateral3)} = ${CusProductStatus.PastDue}`,
					sql`(${products.config}->>'ignore_past_due')::boolean = true`,
					commonResetPredicates(),
					resetOwnedByAutumn(),
					afterCursor(),
				),
			);

		// One statement, one snapshot: branch consistency without a
		// multi-statement transaction, and statement_timeout caps the whole page.
		return unionAll(branch1, branch2, branch3)
			.orderBy(sql`"sort_reset"`, sql`"sort_id"`)
			.limit(batchSize);
	}

	static async getActiveResetPassed({
		db,
		customDateUnix,
		batchSize = 1000,
		limit,
		includeSeparateIntervalResets = true,
		onPageFetched,
	}: {
		db: DrizzleCli;
		customDateUnix?: number;
		batchSize?: number;
		limit?: number;
		includeSeparateIntervalResets?: boolean;
		/** Test seam: runs between pages to exercise mid-pagination mutations. */
		onPageFetched?: (page: ResetCusEnt[]) => void | Promise<void>;
	}) {
		const allResults: FullCusEntWithProduct[] = [];
		const now = customDateUnix ?? Date.now();
		let cursor: { nextResetAt: number; id: string } | null = null;
		const emittedIds = new Set<string>();

		while (true) {
			const page = await CusEntService.buildActiveResetPassedPage({
				db,
				now,
				batchSize,
				cursor,
				includeSeparateIntervalResets,
			});

			if (page.length === 0) break;

			const freshRows: typeof page = [];
			for (const item of page) {
				const id = item.customer_entitlements.id;
				if (emittedIds.has(id)) continue;
				emittedIds.add(id);
				freshRows.push(item);
			}

			const mappedData = freshRows.map((item) => ({
				...item.customer_entitlements,
				entitlement: {
					...item.entitlements,
					feature: item.features,
				},
				// Seats inherit the parent's lifecycle so downstream reset logic
				// (resetsViaInvoice, Stripe anchor) behaves like the parent's.
				customer_product: item.customer_products
					? {
							...item.customer_products,
							status:
								(item.parent_status as CusProductStatus | null) ??
								item.customer_products.status,
							subscription_ids:
								(item.parent_subscription_ids as string[] | null) ??
								item.customer_products.subscription_ids,
						}
					: item.customer_products,
				customer: item.customers,
				replaceables: [],
				rollovers: [],
			})) as ResetCusEnt[];

			allResults.push(...mappedData);
			console.log(`Fetched ${allResults.length} entitlements to reset`);

			const lastRow = page[page.length - 1].customer_entitlements;
			cursor = {
				nextResetAt: Number(lastRow.next_reset_at),
				id: lastRow.id,
			};

			if (onPageFetched) await onPageFetched(mappedData);

			if (page.length < batchSize) break;
			if (limit && allResults.length >= limit) break;
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
