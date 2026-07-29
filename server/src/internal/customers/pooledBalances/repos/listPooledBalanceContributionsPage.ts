import {
	type ApiPooledBalanceContributionV0,
	customerProducts,
	entities,
	pooledBalanceContributions,
	pooledBalances,
	products,
} from "@autumn/shared";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/** One page of a pool's contributions with entity/plan labels, org/env scoped
 * through the pool row so foreign pool ids return nothing. */
export const listPooledBalanceContributionsPage = async ({
	db,
	orgId,
	env,
	pooledBalanceId,
	offset,
	limit,
	search,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	pooledBalanceId: string;
	offset: number;
	limit: number;
	search?: string;
}): Promise<{
	list: ApiPooledBalanceContributionV0[];
	totalCount: number;
	totalFilteredCount: number;
}> => {
	const scopedWhere = and(
		eq(pooledBalanceContributions.pooled_balance_id, pooledBalanceId),
		eq(pooledBalances.org_id, orgId),
		eq(pooledBalances.env, env),
	);

	const trimmedSearch = search?.trim();
	const searchWhere = trimmedSearch
		? or(
				ilike(entities.name, `%${trimmedSearch}%`),
				ilike(entities.id, `%${trimmedSearch}%`),
				ilike(products.name, `%${trimmedSearch}%`),
			)
		: undefined;

	const countWhere = async (where: SQL | undefined) => {
		const [row] = await db
			.select({ value: count() })
			.from(pooledBalanceContributions)
			.innerJoin(
				pooledBalances,
				eq(pooledBalances.id, pooledBalanceContributions.pooled_balance_id),
			)
			.innerJoin(
				customerProducts,
				eq(
					customerProducts.id,
					pooledBalanceContributions.source_customer_product_id,
				),
			)
			.innerJoin(
				products,
				eq(products.internal_id, customerProducts.internal_product_id),
			)
			.leftJoin(
				entities,
				eq(entities.internal_id, customerProducts.internal_entity_id),
			)
			.where(where);
		return row?.value ?? 0;
	};

	const [rows, totalCount, totalFilteredCount] = await Promise.all([
		db
			.select({
				id: pooledBalanceContributions.id,
				entity_id: entities.id,
				entity_name: entities.name,
				plan_id: products.id,
				plan_name: products.name,
				current_contribution: pooledBalanceContributions.current_contribution,
				next_cycle_contribution:
					pooledBalanceContributions.next_cycle_contribution,
				created_at: pooledBalanceContributions.created_at,
			})
			.from(pooledBalanceContributions)
			.innerJoin(
				pooledBalances,
				eq(pooledBalances.id, pooledBalanceContributions.pooled_balance_id),
			)
			.innerJoin(
				customerProducts,
				eq(
					customerProducts.id,
					pooledBalanceContributions.source_customer_product_id,
				),
			)
			.innerJoin(
				products,
				eq(products.internal_id, customerProducts.internal_product_id),
			)
			.leftJoin(
				entities,
				eq(entities.internal_id, customerProducts.internal_entity_id),
			)
			.where(and(scopedWhere, searchWhere))
			.orderBy(
				desc(pooledBalanceContributions.created_at),
				desc(pooledBalanceContributions.id),
			)
			.offset(offset)
			.limit(limit),
		countWhere(scopedWhere),
		searchWhere ? countWhere(and(scopedWhere, searchWhere)) : undefined,
	]);

	return {
		list: rows,
		totalCount,
		totalFilteredCount: totalFilteredCount ?? totalCount,
	};
};
