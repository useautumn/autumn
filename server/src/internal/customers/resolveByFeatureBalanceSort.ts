import {
	ACTIVE_STATUSES,
	type AppEnv,
	type BalanceFilterOp,
	type CustomerListFilters,
	customers,
	type FeatureBalanceCursorFields,
	type FeatureBalanceSortBasis,
	type SortOrder,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	getMotherDuckResolverDb,
	runMdWithTimeout,
} from "@/external/motherduck/initMotherDuck.js";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { buildSearchPredicates } from "./CusSearchService.js";

/** `total` is the value of the REQUESTED basis (remaining/granted/usage) —
 * the cursor and ranking key on both the lake and PG sides. */
export type FeatureBalanceSortRow = {
	internalId: string;
	isUnlimited: boolean;
	total: number;
};

/** Lake column/expression for each basis. Mirrors PG: remaining=SUM(balance),
 * granted≈SUM(allowance+adjustment), usage=granted−remaining (prepaid quantity
 * and legacy entity multipliers are PG-verify refinements, not lake ones). */
export const basisExprSql = (basis: FeatureBalanceSortBasis): SQL => {
	if (basis === "granted") return sql.raw("granted_total");
	if (basis === "usage") return sql.raw("(granted_total - total)");
	return sql.raw("total");
};

/** Lake nominations per top-up iteration; sized so one batch usually fills a
 * 250 page even after expired-row inflation (~12% table-wide) and filters. */
const NOMINATION_BATCH_SIZE = 500;
const MAX_TOPUP_ITERATIONS = 4;

/** Customers whose lake total UNDER-reports (negative balances on rows the
 * lake can't filter out) would be nominated too late or never — they must be
 * considered on every page. Small set (~4k on the worst feature measured). */
const DEFLATION_SET_CAP = 10_000;
const DEFLATION_SET_TTL_SECONDS = 30 * 60;

/** Basis-scoped: the cached rows carry exact totals in the requested basis. */
const deflationSetCacheKey = ({
	internalFeatureId,
	basis,
}: {
	internalFeatureId: string;
	basis: FeatureBalanceSortBasis;
}) => `balanceSort:deflationSet:${internalFeatureId}:${basis}`;

type NominationCursor = { u: boolean; b: number; id: string };

const activeStatusList = (): SQL =>
	sql.join(
		ACTIVE_STATUSES.map((status) => sql`${status}`),
		sql`, `,
	);

export type BalanceThresholdFilter = {
	op: BalanceFilterOp;
	value: number;
	basis: FeatureBalanceSortBasis;
};

/** The scalar a threshold compares in the chosen basis. */
export const basisValueOf = ({
	basis,
	remaining,
	granted,
}: {
	basis: FeatureBalanceSortBasis;
	remaining: number;
	granted: number;
}): number =>
	basis === "granted"
		? granted
		: basis === "usage"
			? granted - remaining
			: remaining;

/** Thresholds compare the FINITE value only (sums exclude unlimited rows):
 * mixed unlimited+finite customers are judged on their finite side, and
 * pure-unlimited customers (finite 0) fail both directions — a threshold is a
 * statement about numbers, and unlimited is not a number. */
export const passesBalanceFilter = ({
	total,
	op,
	value,
}: {
	total: number;
	op: BalanceFilterOp;
	value: number;
}): boolean => (op === ">" ? total > value : total < value);

/** SQL twin of `passesBalanceFilter`, shared by the lake nomination/candidate
 * queries and the PG dense walk. */
export const balanceThresholdSql = ({
	totalExpr,
	op,
	value,
}: {
	totalExpr: SQL;
	op: BalanceFilterOp;
	value: number;
}): SQL =>
	op === ">" ? sql`${totalExpr} > ${value}` : sql`${totalExpr} < ${value}`;

/** "Live" must match what the Usage column sums (cusEnts of ACTIVE_STATUSES
 * products + loose rows) — NOT `ce.expired`, whose NULL→true backfill lags and
 * leaves churned-product rows looking live. Requires `cp` joined on
 * ce.customer_product_id. */
export const liveCusEntPredicate = (): SQL => sql`
	(ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
	AND ce.pooled_contribution_id IS NULL
	AND (
		ce.customer_product_id IS NULL
		OR cp.status IN (${activeStatusList()})
	)
`;

/** Exact per-customer totals from PG for a candidate id set, with the
 * customer-level search/filter predicates applied in the same pass.
 * Candidates with no live rows come back at 0 (nominations can be stale).
 * `remainingFilter` drops rows failing a remaining-balance threshold. */
const verifyExactBalances = async ({
	db,
	orgId,
	env,
	search,
	filters,
	internalFeatureId,
	internalCustomerIds,
	basis,
	remainingFilter,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	search: string;
	filters?: CustomerListFilters;
	internalFeatureId: string;
	internalCustomerIds: string[];
	basis: FeatureBalanceSortBasis;
	remainingFilter?: BalanceThresholdFilter;
}): Promise<FeatureBalanceSortRow[]> => {
	if (internalCustomerIds.length === 0) return [];

	const predicates = buildSearchPredicates({ orgId, env, search, filters });
	const idList = sql.join(
		internalCustomerIds.map((id) => sql`${id}`),
		sql`, `,
	);

	const rows = await db.execute<{
		internal_customer_id: string;
		is_unlimited: boolean;
		remaining: string | number;
		granted: string | number;
	}>(sql`
		SELECT
			${customers.internal_id} AS internal_customer_id,
			COALESCE(b.is_unlimited, false) AS is_unlimited,
			COALESCE(b.remaining, 0) AS remaining,
			COALESCE(b.granted, 0) AS granted
		FROM customers
		LEFT JOIN (
			SELECT
				ce.internal_customer_id,
				COALESCE(BOOL_OR(ce.unlimited), false) AS is_unlimited,
				SUM(ce.balance) FILTER (WHERE ce.unlimited IS NOT TRUE) AS remaining,
				SUM(
					COALESCE(e.allowance, 0) * COALESCE(cp.quantity, 1)
					+ COALESCE(ce.adjustment, 0)
				) FILTER (WHERE ce.unlimited IS NOT TRUE) AS granted
			FROM customer_entitlements ce
			LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
			LEFT JOIN entitlements e ON e.id = ce.entitlement_id
			WHERE ce.internal_customer_id IN (${idList})
				AND ce.internal_feature_id = ${internalFeatureId}
				AND ${liveCusEntPredicate()}
			GROUP BY ce.internal_customer_id
		) b ON b.internal_customer_id = ${customers.internal_id}
		WHERE ${customers.internal_id} IN (${idList})
			AND ${predicates.whereRaw}
		${planetScaleTag({ query: "verifyFeatureBalances" })}
	`);

	const mapped: FeatureBalanceSortRow[] = [];
	for (const row of rows) {
		const remaining = Number(row.remaining);
		const granted = Number(row.granted);
		if (
			remainingFilter &&
			!passesBalanceFilter({
				total: basisValueOf({
					basis: remainingFilter.basis,
					remaining,
					granted,
				}),
				op: remainingFilter.op,
				value: remainingFilter.value,
			})
		) {
			continue;
		}
		mapped.push({
			internalId: row.internal_customer_id,
			// Under a threshold filter, rows pass on finite merit — suppress the
			// unlimited stripe so the page orders by the filtered values.
			isUnlimited: remainingFilter ? false : Boolean(row.is_unlimited),
			total: basisValueOf({ basis, remaining, granted }),
		});
	}
	return mapped;
};

/** Cached exact rows for the deflation-exception customers. Values are up to
 * TTL stale, but they only steer RANKING — displayed numbers come from
 * hydration. Recompute is a feature-index scan (~seconds on whale features). */
export const getDeflationExceptionRows = async ({
	db,
	orgId,
	env,
	internalFeatureId,
	basis,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalFeatureId: string;
	basis: FeatureBalanceSortBasis;
}): Promise<FeatureBalanceSortRow[]> => {
	const miscRedis = getMiscRedis();
	const cacheKey = deflationSetCacheKey({ internalFeatureId, basis });

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "balance-sort:deflation-set:get",
		redisInstance: miscRedis,
	});
	if (cached) {
		return (JSON.parse(cached) as [string, boolean, number][]).map(
			([internalId, isUnlimited, total]) => ({
				internalId,
				isUnlimited,
				total,
			}),
		);
	}

	// Deflation sources = negative rows the lake counts but the live definition
	// excludes: pooled contributions, and rows bound to non-active products
	// (status-based — the lazily-backfilled `expired` flag misses churned rows).
	const tStart = performance.now();
	const idRows = await db.execute<{ internal_customer_id: string }>(sql`
		SELECT DISTINCT ce.internal_customer_id
		FROM customer_entitlements ce
		LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
		WHERE ce.internal_feature_id = ${internalFeatureId}
			AND ce.balance < 0
			AND (
				ce.pooled_contribution_id IS NOT NULL
				OR (
					ce.customer_product_id IS NOT NULL
					AND (cp.id IS NULL OR cp.status NOT IN (${activeStatusList()}))
				)
			)
		LIMIT ${DEFLATION_SET_CAP}
		${planetScaleTag({ query: "balanceSortDeflationSet" })}
	`);
	if (idRows.length >= DEFLATION_SET_CAP) {
		logger.warn(
			`[balanceSort] deflation set hit cap (${DEFLATION_SET_CAP}) for feature ${internalFeatureId} — under-ranked customers beyond the cap can be missed`,
		);
	}

	// Exact values computed without search/filters: the set is feature-scoped
	// and reused across requests; per-request predicates apply at merge time.
	const rows =
		idRows.length === 0
			? []
			: await verifyExactBalances({
					db,
					orgId,
					env,
					search: "",
					filters: undefined,
					internalFeatureId,
					internalCustomerIds: idRows.map((row) => row.internal_customer_id),
					basis,
				});

	logger.info(
		`[balanceSort] deflation set for ${internalFeatureId}: ${rows.length} customers in ${(performance.now() - tStart).toFixed(0)}ms`,
	);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				cacheKey,
				JSON.stringify(rows.map((r) => [r.internalId, r.isUnlimited, r.total])),
				"EX",
				DEFLATION_SET_TTL_SECONDS,
			),
		source: "balance-sort:deflation-set:set",
		redisInstance: miscRedis,
	});
	return rows;
};

/** Desc ranks unlimited first then largest totals; asc is the exact mirror. */
const compareRows = (
	a: FeatureBalanceSortRow,
	b: FeatureBalanceSortRow,
	sortOrder: SortOrder,
): number => {
	const direction = sortOrder === "asc" ? -1 : 1;
	if (a.isUnlimited !== b.isUnlimited) {
		return (a.isUnlimited ? -1 : 1) * direction;
	}
	if (a.total !== b.total) return (b.total - a.total) * direction;
	return (a.internalId < b.internalId ? 1 : -1) * direction;
};

const isAfterCursor = (
	row: FeatureBalanceSortRow,
	cursor: FeatureBalanceCursorFields,
	sortOrder: SortOrder,
): boolean =>
	compareRows(
		row,
		{ internalId: cursor.id, isUnlimited: cursor.u, total: cursor.b },
		sortOrder,
	) > 0;

const nominationQuery = ({
	internalFeatureId,
	after,
	sortOrder,
	basis,
	remainingFilter,
}: {
	internalFeatureId: string;
	after: NominationCursor | null;
	sortOrder: SortOrder;
	basis: FeatureBalanceSortBasis;
	remainingFilter?: BalanceThresholdFilter;
}): SQL => {
	const direction = sql.raw(sortOrder === "asc" ? "ASC" : "DESC");
	const basisExpr = basisExprSql(basis);
	// Under a threshold filter the stripe is suppressed (verify emits u=false),
	// so the cursor/order tuple must drop is_unlimited — a (false, ...) tuple
	// would otherwise exclude every mixed customer from later batches.
	const cursorPredicate = after
		? remainingFilter
			? sortOrder === "asc"
				? sql`AND (${basisExpr}, internal_customer_id) > (${after.b}, ${after.id})`
				: sql`AND (${basisExpr}, internal_customer_id) < (${after.b}, ${after.id})`
			: sortOrder === "asc"
				? sql`AND (is_unlimited, ${basisExpr}, internal_customer_id) > (${after.u}, ${after.b}, ${after.id})`
				: sql`AND (is_unlimited, ${basisExpr}, internal_customer_id) < (${after.u}, ${after.b}, ${after.id})`
		: sql``;
	// Pre-filter approximately in the lake (verify re-checks exactly): a `< x`
	// threshold against a desc sort otherwise burns every batch on giants that
	// all fail verify — 0-row pages after the full top-up budget.
	const thresholdPredicate = remainingFilter
		? sql`AND ${balanceThresholdSql({
				totalExpr: basisExprSql(remainingFilter.basis),
				op: remainingFilter.op,
				value: remainingFilter.value,
			})}`
		: sql``;
	const orderBy = remainingFilter
		? sql`${basisExpr} ${direction}, internal_customer_id ${direction}`
		: sql`is_unlimited ${direction}, ${basisExpr} ${direction}, internal_customer_id ${direction}`;

	return sql`
		SELECT internal_customer_id, is_unlimited, ${basisExpr} AS total
		FROM main.ce_balance_totals
		WHERE internal_feature_id = ${internalFeatureId}
		${thresholdPredicate}
		${cursorPredicate}
		ORDER BY ${orderBy}
		LIMIT ${NOMINATION_BATCH_SIZE}
	`;
};

/**
 * Balance sort resolver: MotherDuck nominates candidates from the cached
 * totals (approximate — missing `expired`, ~5min stale), PG verifies exact
 * sums and re-ranks, topping up until the page fills. Only feature HOLDERS
 * appear: the totals cache has no rows for customers without the feature.
 */
export const resolveInternalIdsByFeatureBalanceSort = async ({
	db,
	orgId,
	env,
	search,
	filters,
	internalFeatureId,
	cursor,
	limit,
	sortOrder = "desc",
	basis = "remaining",
	remainingFilter,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	search: string;
	filters?: CustomerListFilters;
	internalFeatureId: string;
	cursor?: FeatureBalanceCursorFields | null;
	limit: number;
	sortOrder?: SortOrder;
	basis?: FeatureBalanceSortBasis;
	remainingFilter?: BalanceThresholdFilter;
}): Promise<{ rows: FeatureBalanceSortRow[]; hasMore: boolean }> => {
	const md = await getMotherDuckResolverDb();

	const verifiedById = new Map<string, FeatureBalanceSortRow>();

	// Deflation exceptions ride along from page one: their lake rank is wrong
	// by construction, so only their (cached-exact) values can place them.
	const exceptionRows = await getDeflationExceptionRows({
		db,
		orgId,
		env,
		internalFeatureId,
		basis,
	});
	const exceptionIds = new Set(exceptionRows.map((row) => row.internalId));

	let nominationAfter: NominationCursor | null = cursor
		? { u: cursor.u, b: cursor.b, id: cursor.id }
		: null;
	let nominationsExhausted = false;

	for (let iteration = 0; iteration < MAX_TOPUP_ITERATIONS; iteration++) {
		const nominationRows = (await runMdWithTimeout({
			label: "balance-sort nomination",
			run: () =>
				md.execute(
					nominationQuery({
						internalFeatureId,
						after: nominationAfter,
						sortOrder,
						basis,
						remainingFilter,
					}),
				),
		})) as unknown as {
			internal_customer_id: string;
			is_unlimited: boolean;
			total: number | string;
		}[];

		if (nominationRows.length < NOMINATION_BATCH_SIZE) {
			nominationsExhausted = true;
		}

		const freshIds = nominationRows
			.map((row) => row.internal_customer_id)
			.filter((id) => !verifiedById.has(id) && !exceptionIds.has(id));

		const verified = await verifyExactBalances({
			db,
			orgId,
			env,
			search,
			filters,
			internalFeatureId,
			internalCustomerIds: freshIds,
			basis,
			remainingFilter,
		});
		for (const row of verified) verifiedById.set(row.internalId, row);

		if (iteration === 0) {
			// Exceptions get per-request predicates applied via a verify pass too;
			// cached values only pre-place them when no search/filters narrow the set.
			const hasRequestPredicates = Boolean(
				search.trim() ||
					(filters && Object.values(filters).some((v) => v !== undefined)) ||
					remainingFilter,
			);
			const placedExceptions = hasRequestPredicates
				? await verifyExactBalances({
						db,
						orgId,
						env,
						search,
						filters,
						internalFeatureId,
						internalCustomerIds: exceptionRows.map((r) => r.internalId),
						basis,
						remainingFilter,
					})
				: exceptionRows;
			for (const row of placedExceptions) verifiedById.set(row.internalId, row);
		}

		const pageCandidates = [...verifiedById.values()]
			.filter((row) => !cursor || isAfterCursor(row, cursor, sortOrder))
			.sort((a, b) => compareRows(a, b, sortOrder));

		if (pageCandidates.length > limit || nominationsExhausted) {
			return {
				rows: pageCandidates.slice(0, limit),
				hasMore: pageCandidates.length > limit || !nominationsExhausted,
			};
		}

		const lastNomination = nominationRows[nominationRows.length - 1];
		nominationAfter = {
			u: Boolean(lastNomination.is_unlimited),
			b: Number(lastNomination.total),
			id: lastNomination.internal_customer_id,
		};
	}

	// Top-up budget exhausted with a page unfilled: heavy filter attrition.
	// Return what verified; more may exist past the nomination horizon.
	const pageCandidates = [...verifiedById.values()]
		.filter((row) => !cursor || isAfterCursor(row, cursor, sortOrder))
		.sort((a, b) => compareRows(a, b, sortOrder));
	logger.warn(
		`[balanceSort] top-up budget exhausted for feature ${internalFeatureId}: ${pageCandidates.length}/${limit} rows after ${MAX_TOPUP_ITERATIONS} batches`,
	);
	return { rows: pageCandidates.slice(0, limit), hasMore: true };
};
