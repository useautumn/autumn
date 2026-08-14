import {
	type AppEnv,
	type CustomerListFilters,
	customers,
	type SortOrder,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { activeStatusListSql, monthlyBasePriceExpr } from "./basePriceSql.js";
import { buildSearchPredicates } from "./CusSearchService.js";

/** Above this, per-customer_product probing degrades and the price-driven
 * join shape (global customer_prices scan) wins. Benchmarked in
 * experiments/explainSortByPrice.ts. */
const LARGE_ORG_CUSTOMER_THRESHOLD = 20_000;
const ORG_SIZE_CACHE_TTL_SECONDS = 6 * 60 * 60;

export type BasePriceSortRow = { internalId: string; total: number };

const orgSizeCacheKey = ({ orgId, env }: { orgId: string; env: AppEnv }) =>
	`basePriceSort:orgSize:${orgId}:${env}`;

/** Capped count: walks the index only up to the threshold, so whale orgs pay
 * the same as mid-size ones. Verdict cached in misc Redis. */
const resolveOrgIsLarge = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}): Promise<boolean> => {
	const miscRedis = getMiscRedis();
	const cacheKey = orgSizeCacheKey({ orgId, env });

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "base-price-sort:org-size:get",
		redisInstance: miscRedis,
	});
	if (cached === "large") return true;
	if (cached === "small") return false;

	const rows = await db.execute<{ n: number | string }>(sql`
		SELECT COUNT(*) AS n FROM (
			SELECT 1 FROM customers c
			WHERE c.org_id = ${orgId} AND c.env = ${env}
			LIMIT ${LARGE_ORG_CUSTOMER_THRESHOLD + 1}
		) capped
		${planetScaleTag({ query: "basePriceSortOrgSize" })}
	`);
	const isLarge = Number(rows[0]?.n ?? 0) > LARGE_ORG_CUSTOMER_THRESHOLD;

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				cacheKey,
				isLarge ? "large" : "small",
				"EX",
				ORG_SIZE_CACHE_TTL_SECONDS,
			),
		source: "base-price-sort:org-size:set",
		redisInstance: miscRedis,
	});
	return isLarge;
};

const orgProductsSubquery = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): SQL => sql`
	SELECT prod.internal_id FROM products prod
	WHERE prod.org_id = ${orgId} AND prod.env = ${env}
`;

/** Small orgs: org products → customer_products → prices. Per-product index
 * probes; never touches the global customer_prices table. */
const cusProductDrivenTotalsCte = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): SQL => sql`
	SELECT cp.internal_customer_id, SUM(${monthlyBasePriceExpr()}) AS total
	FROM customer_products cp
	JOIN customer_prices cpr ON cpr.customer_product_id = cp.id
	JOIN prices p ON p.id = cpr.price_id AND p.org_id = ${orgId}
	WHERE cp.internal_product_id IN (${orgProductsSubquery({ orgId, env })})
		AND cp.status IN (${activeStatusListSql()})
		AND p.config->>'amount' IS NOT NULL
	GROUP BY cp.internal_customer_id
`;

/** Large orgs: prices → customer_prices → status probe on customer_products.
 * Avoids probing customer_prices once per customer_product (~6% hit rate). */
const priceDrivenTotalsCte = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): SQL => sql`
	SELECT cp.internal_customer_id, SUM(${monthlyBasePriceExpr()}) AS total
	FROM prices p
	JOIN customer_prices cpr ON cpr.price_id = p.id
	JOIN customer_products cp ON cp.id = cpr.customer_product_id
		AND cp.status IN (${activeStatusListSql()})
	WHERE p.org_id = ${orgId}
		AND p.internal_product_id IN (${orgProductsSubquery({ orgId, env })})
		AND p.config->>'amount' IS NOT NULL
	GROUP BY cp.internal_customer_id
`;

/**
 * Keyset resolver for "sort by base price": returns one page of internal ids
 * ordered by monthly base-price total. Customers without an active priced
 * product rank at 0 so filters and search still see the full org.
 */
export const resolveInternalIdsByBasePriceSort = async ({
	db,
	orgId,
	env,
	search,
	filters,
	cursor,
	limit,
	sortOrder = "desc",
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	search: string;
	filters?: CustomerListFilters;
	cursor?: { p: number; id: string } | null;
	limit: number;
	sortOrder?: SortOrder;
}): Promise<{ rows: BasePriceSortRow[]; hasMore: boolean }> => {
	const isLarge = await resolveOrgIsLarge({ db, orgId, env });
	const totalsCte = isLarge
		? priceDrivenTotalsCte({ orgId, env })
		: cusProductDrivenTotalsCte({ orgId, env });

	const predicates = buildSearchPredicates({ orgId, env, search, filters });

	const totalExpr = sql`COALESCE(t.total, 0)`;
	const direction = sql.raw(sortOrder === "asc" ? "ASC" : "DESC");
	const cursorPredicate = cursor
		? sortOrder === "asc"
			? sql`AND (${totalExpr}, ${customers.internal_id}) > (${cursor.p}, ${cursor.id})`
			: sql`AND (${totalExpr}, ${customers.internal_id}) < (${cursor.p}, ${cursor.id})`
		: sql``;

	const fetchLimit = limit + 1;

	const rows = await db.execute<{
		internal_customer_id: string;
		total: string | number;
	}>(sql`
		WITH totals AS (${totalsCte})
		SELECT
			${customers.internal_id} AS internal_customer_id,
			${totalExpr} AS total
		FROM customers
		LEFT JOIN totals t ON t.internal_customer_id = ${customers.internal_id}
		WHERE ${predicates.whereRaw}
		${cursorPredicate}
		ORDER BY ${totalExpr} ${direction}, ${customers.internal_id} ${direction}
		LIMIT ${fetchLimit}
		${planetScaleTag({ query: "searchCustomersByBasePriceSort" })}
	`);

	const mapped: BasePriceSortRow[] = rows.map((row) => ({
		internalId: row.internal_customer_id,
		total: Number(row.total),
	}));

	const hasMore = mapped.length > limit;
	return { rows: hasMore ? mapped.slice(0, limit) : mapped, hasMore };
};
