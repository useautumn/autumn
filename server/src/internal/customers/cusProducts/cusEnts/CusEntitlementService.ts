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
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { UpdateCustomerEntitlement } from "@/internal/billing/v2/types";
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
		db,
		data,
	}: {
		db: DrizzleCli;
		data: InsertCustomerEntitlement[] | FullCustomerEntitlement[];
	}) {
		if (Array.isArray(data) && data.length === 0) {
			return;
		}

		await db.insert(customerEntitlements).values(data as any); // DRIZZLE TYPE REFACTOR
	}

	static async getActiveResetPassed({
		db,
		customDateUnix,
		batchSize = 1000,
	}: {
		db: DrizzleCli;
		customDateUnix?: number;
		batchSize?: number;
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

			if (data.length === 0) {
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
		db,
		id,
		updates,
	}: {
		db: DrizzleCli;
		id: string;
		updates: Partial<InsertCustomerEntitlement>;
	}) {
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

	static async batchUpdate({
		db,
		data,
	}: {
		db: DrizzleCli;
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
					db,
					id: customerEntitlement.id,
					updates: updates as Partial<InsertCustomerEntitlement>,
				}),
			);
		}
		await Promise.all(updatePromises);

		// await CusEntService.upsert({
		// 	db,
		// 	data: updatedCustomerEntitlements,
		// });
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
		db,
		id,
		amount,
	}: {
		db: DrizzleCli;
		id: string;
		amount: number;
	}) {
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
		db,
		id,
		amount,
	}: {
		db: DrizzleCli;
		id: string;
		amount: number;
	}) {
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
