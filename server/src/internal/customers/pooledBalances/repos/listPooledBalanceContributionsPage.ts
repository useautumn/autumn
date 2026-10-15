import {
	type ApiPooledBalanceContributionV0,
	customerProducts,
	entities,
	FeatureCombine,
	features,
	featureToCombine,
	pooledBalanceContributions,
	pooledBalances,
	products,
} from "@autumn/shared";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
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
	winningContributionId: string | null;
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

	const [rows, totalCount, totalFilteredCount, winningContributionId] =
		await Promise.all([
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
					competes: pooledBalanceContributions.competes,
					unlimited: pooledBalanceContributions.unlimited,
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
				// Competing shares first so a max/min pool's candidates land on page one.
				.orderBy(
					desc(pooledBalanceContributions.competes),
					desc(pooledBalanceContributions.created_at),
					desc(pooledBalanceContributions.id),
				)
				.offset(offset)
				.limit(limit),
			countWhere(scopedWhere),
			searchWhere ? countWhere(and(scopedWhere, searchWhere)) : undefined,
			findWinningContributionId({ db, orgId, env, pooledBalanceId }),
		]);

	return {
		list: rows,
		totalCount,
		totalFilteredCount: totalFilteredCount ?? totalCount,
		winningContributionId,
	};
};

/** The competing share that sets a max / min pool, across the whole pool rather than one page. */
const findWinningContributionId = async ({
	db,
	orgId,
	env,
	pooledBalanceId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	pooledBalanceId: string;
}): Promise<string | null> => {
	const [pool] = await db
		.select({ config: features.config })
		.from(pooledBalances)
		.innerJoin(
			features,
			eq(features.internal_id, pooledBalances.internal_feature_id),
		)
		.where(
			and(
				eq(pooledBalances.id, pooledBalanceId),
				eq(pooledBalances.org_id, orgId),
				eq(pooledBalances.env, env),
			),
		)
		.limit(1);
	if (!pool) return null;

	const combine = featureToCombine({ feature: pool });
	if (combine === FeatureCombine.Sum) return null;

	// Max lets an unlimited share win; min keeps the lowest limited one.
	const order =
		combine === FeatureCombine.Max
			? [
					desc(pooledBalanceContributions.unlimited),
					desc(pooledBalanceContributions.current_contribution),
				]
			: [
					asc(pooledBalanceContributions.unlimited),
					asc(pooledBalanceContributions.current_contribution),
				];
	const [winner] = await db
		.select({ id: pooledBalanceContributions.id })
		.from(pooledBalanceContributions)
		.where(
			and(
				eq(pooledBalanceContributions.pooled_balance_id, pooledBalanceId),
				eq(pooledBalanceContributions.competes, true),
			),
		)
		.orderBy(...order, asc(pooledBalanceContributions.created_at))
		.limit(1);
	return winner?.id ?? null;
};
