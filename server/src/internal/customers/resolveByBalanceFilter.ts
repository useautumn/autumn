import {
	type AppEnv,
	type BalanceFilter,
	type CustomerListFilters,
	customers,
	type SortOrder,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	getMotherDuckResolverDb,
	isMotherDuckConfigured,
	runMdWithTimeout,
} from "@/external/motherduck/initMotherDuck.js";
import { buildSearchPredicates } from "./CusSearchService.js";
import { getCursorPredicateSql } from "./cursorPaginatedFullCusQuery.js";
import {
	balanceThresholdSql,
	basisExprSql,
	basisValueOf,
	getDeflationExceptionRows,
	liveCusEntPredicate,
	passesBalanceFilter,
	thresholdRequiresFiniteRows,
} from "./resolveByFeatureBalanceSort.js";

/** Above this many lake matches the candidate IN-list stops being viable and
 * the dense lazy walk (cheap when matches are plentiful) takes over. */
const SPARSE_CANDIDATE_CAP = 25_000;
const PAGE_SCAN_BATCH = 200;
const MAX_TOPUP_ITERATIONS = 4;

const rowsOf = <T>(result: unknown): T[] => {
	if (Array.isArray(result)) return result as T[];
	if (result && typeof result === "object" && "rows" in result) {
		return (result as { rows: T[] }).rows;
	}
	return [];
};

/** Exact remaining balance per candidate (live definition); absent = no live
 * rows. Request-level predicates are NOT applied here — the paging query owns
 * them. */
const exactRemainingByCustomer = async ({
	db,
	internalFeatureId,
	internalCustomerIds,
}: {
	db: DrizzleCli;
	internalFeatureId: string;
	internalCustomerIds: string[];
}): Promise<
	Map<
		string,
		{
			remaining: number;
			granted: number;
			unlimitedUsage: number;
			finiteRows: number;
		}
	>
> => {
	if (internalCustomerIds.length === 0) return new Map();

	const rows = await db.execute<{
		internal_customer_id: string;
		remaining: string | number;
		granted: string | number;
		unlimited_used: string | number;
		finite_rows: string | number;
	}>(sql`
		SELECT
			ce.internal_customer_id,
			COALESCE(SUM(ce.balance) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS remaining,
			COALESCE(SUM(
				COALESCE(e.allowance, 0) * COALESCE(cp.quantity, 1)
				+ COALESCE(ce.adjustment, 0)
			) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS granted,
			COALESCE(SUM(-ce.balance) FILTER (WHERE ce.unlimited IS TRUE), 0) AS unlimited_used,
			COUNT(*) FILTER (WHERE ce.unlimited IS NOT TRUE) AS finite_rows
		FROM customer_entitlements ce
		LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
		LEFT JOIN entitlements e ON e.id = ce.entitlement_id
		WHERE ce.internal_customer_id IN (${sql.join(
			internalCustomerIds.map((id) => sql`${id}`),
			sql`, `,
		)})
			AND ce.internal_feature_id = ${internalFeatureId}
			AND ${liveCusEntPredicate()}
		GROUP BY ce.internal_customer_id
		${planetScaleTag({ query: "balanceFilterExactRemaining" })}
	`);

	return new Map(
		rows.map((row) => [
			row.internal_customer_id,
			{
				remaining: Number(row.remaining),
				granted: Number(row.granted),
				unlimitedUsage: Number(row.unlimited_used),
				finiteRows: Number(row.finite_rows),
			},
		]),
	);
};

type LakeMatch = {
	/** Lake-side match count for the threshold (approximate: 5-min staleness). */
	matchCount: number;
	/** Full candidate id set, or null when the match set is too large for the
	 * IN-list path. */
	candidateIds: string[] | null;
};

/** Lake match count + candidate ids for the threshold, or null when the lake
 * is unavailable. */
const getLakeMatch = async ({
	db,
	orgId,
	env,
	internalFeatureId,
	balance,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalFeatureId: string;
	balance: BalanceFilter;
}): Promise<LakeMatch | null> => {
	if (!isMotherDuckConfigured()) return null;

	try {
		const md = await getMotherDuckResolverDb();
		const matchWhere = sql`internal_feature_id = ${internalFeatureId} AND ${balanceThresholdSql(
			{
				totalExpr: basisExprSql(balance.basis),
				op: balance.op,
				value: balance.value,
			},
		)}${
			thresholdRequiresFiniteRows(balance.basis)
				? sql` AND finite_rows > 0`
				: sql``
		}`;

		const countRows = rowsOf<{ n: number | string }>(
			await runMdWithTimeout({
				label: "balance-filter count",
				run: () =>
					md.execute(
						sql`SELECT COUNT(*) AS n FROM main.ce_balance_totals WHERE ${matchWhere}`,
					),
			}),
		);
		const matchCount = Number(countRows[0]?.n ?? Number.POSITIVE_INFINITY);
		if (!Number.isFinite(matchCount)) return null;
		if (matchCount > SPARSE_CANDIDATE_CAP) {
			return { matchCount, candidateIds: null };
		}

		const idRows = rowsOf<{ internal_customer_id: string }>(
			await runMdWithTimeout({
				label: "balance-filter candidates",
				run: () =>
					md.execute(
						sql`SELECT internal_customer_id FROM main.ce_balance_totals WHERE ${matchWhere}`,
					),
			}),
		);
		const candidateIds = new Set(idRows.map((row) => row.internal_customer_id));

		// Deflated customers (lake under-reports) can truly pass a ">" threshold
		// the lake missed — always in the candidate room, verified exactly below.
		if (balance.op === ">") {
			const exceptionRows = await getDeflationExceptionRows({
				db,
				orgId,
				env,
				internalFeatureId,
				basis: balance.basis,
			});
			for (const row of exceptionRows) candidateIds.add(row.internalId);
		}

		return { matchCount, candidateIds: [...candidateIds] };
	} catch (error) {
		logger.warn(
			`[balanceFilter] lake candidate path unavailable, using dense walk: ${error}`,
		);
		return null;
	}
};

/** LATERAL computing the customer's exact live sums for one feature; exposes
 * bal.total / bal.granted / bal.live_rows to the outer query. */
const exactBalanceLateralSql = (internalFeatureId: string): SQL => sql`
	JOIN LATERAL (
		SELECT
			COALESCE(SUM(ce.balance) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS total,
			COALESCE(SUM(
				COALESCE(e.allowance, 0) * COALESCE(cp.quantity, 1)
				+ COALESCE(ce.adjustment, 0)
			) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS granted,
			COALESCE(SUM(-ce.balance) FILTER (WHERE ce.unlimited IS TRUE), 0) AS unlimited_used,
			COUNT(*) FILTER (WHERE ce.unlimited IS NOT TRUE) AS finite_rows,
			COUNT(*) AS live_rows
		FROM customer_entitlements ce
		LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
		LEFT JOIN entitlements e ON e.id = ce.entitlement_id
		WHERE ce.internal_customer_id = ${customers.internal_id}
			AND ce.internal_feature_id = ${internalFeatureId}
			AND ${liveCusEntPredicate()}
	) bal ON true`;

const exactBalanceBasisExpr = (basis: BalanceFilter["basis"]): SQL =>
	basis === "granted"
		? sql.raw("bal.granted")
		: basis === "usage"
			? sql.raw("(bal.granted - bal.total + bal.unlimited_used)")
			: sql.raw("bal.total");

/** Exact-side threshold: basis comparison plus the finite-rows guard for
 * remaining/granted (see `thresholdRequiresFiniteRows`). */
const exactThresholdSql = (balance: BalanceFilter): SQL =>
	sql`${balanceThresholdSql({
		totalExpr: exactBalanceBasisExpr(balance.basis),
		op: balance.op,
		value: balance.value,
	})}${
		thresholdRequiresFiniteRows(balance.basis)
			? sql` AND bal.finite_rows > 0`
			: sql``
	}`;

/**
 * Header count for a balance-filtered list. Sparse thresholds count exactly in
 * PG over the lake candidate set; dense thresholds return the lake count
 * (approximate, and an over-count when other filters/search narrow further).
 * Null when the lake is unavailable — there is no affordable count then.
 */
export const countCustomersByBalanceFilter = async ({
	db,
	orgId,
	env,
	search,
	filters,
	balance,
	internalFeatureId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	search: string;
	filters?: CustomerListFilters;
	balance: BalanceFilter;
	internalFeatureId: string;
}): Promise<{ totalCount: number; approximate: boolean } | null> => {
	const lakeMatch = await getLakeMatch({
		db,
		orgId,
		env,
		internalFeatureId,
		balance,
	});
	if (lakeMatch === null) return null;
	if (lakeMatch.candidateIds === null) {
		return { totalCount: lakeMatch.matchCount, approximate: true };
	}
	if (lakeMatch.candidateIds.length === 0) {
		return { totalCount: 0, approximate: false };
	}

	const predicates = buildSearchPredicates({ orgId, env, search, filters });
	const rows = await db.execute<{ n: number | string }>(sql`
		SELECT COUNT(*) AS n
		FROM customers
		${exactBalanceLateralSql(internalFeatureId)}
		WHERE ${customers.internal_id} IN (${sql.join(
			lakeMatch.candidateIds.map((id) => sql`${id}`),
			sql`, `,
		)})
			AND ${predicates.whereRaw}
			AND bal.live_rows > 0
			AND ${exactThresholdSql(balance)}
		${planetScaleTag({ query: "balanceFilterExactCount" })}
	`);
	return { totalCount: Number(rows[0]?.n ?? 0), approximate: false };
};

/**
 * Balance-threshold filter resolver (created_at sort). Sparse thresholds page
 * a lake-nominated candidate set with exact PG verification; dense thresholds
 * (or no MotherDuck) lazy-walk the cursor index with a per-candidate probe.
 * Feature HOLDERS only, in both paths.
 */
export const resolveInternalIdsByBalanceFilter = async ({
	db,
	orgId,
	env,
	search,
	filters,
	balance,
	internalFeatureId,
	cursor,
	limit,
	sortOrder = "desc",
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	search: string;
	filters?: CustomerListFilters;
	balance: BalanceFilter;
	internalFeatureId: string;
	cursor?: { t: number; id: string } | null;
	limit: number;
	sortOrder?: SortOrder;
}): Promise<{ internalIds: string[]; hasMore: boolean }> => {
	const predicates = buildSearchPredicates({ orgId, env, search, filters });
	const direction = sql.raw(sortOrder === "asc" ? "ASC" : "DESC");
	const cursorPredicate = (after: { t: number; id: string } | null): SQL =>
		after
			? sql`AND ${getCursorPredicateSql({
					createdAtColumn: customers.created_at,
					idColumn: customers.id,
					cursor: after,
					sortOrder,
				})}`
			: sql``;

	const lakeMatch = await getLakeMatch({
		db,
		orgId,
		env,
		internalFeatureId,
		balance,
	});
	const candidateIds = lakeMatch?.candidateIds ?? null;

	if (candidateIds !== null) {
		if (candidateIds.length === 0) return { internalIds: [], hasMore: false };

		const candidateList = sql.join(
			candidateIds.map((id) => sql`${id}`),
			sql`, `,
		);

		const internalIds: string[] = [];
		let after = cursor ?? null;
		for (let iteration = 0; iteration < MAX_TOPUP_ITERATIONS; iteration++) {
			const pageRows = await db.execute<{
				internal_customer_id: string;
				id: string;
				created_at: string | number;
			}>(sql`
				SELECT
					${customers.internal_id} AS internal_customer_id,
					${customers.id} AS id,
					${customers.created_at} AS created_at
				FROM customers
				WHERE ${customers.internal_id} IN (${candidateList})
					AND ${predicates.whereRaw}
					${cursorPredicate(after)}
				ORDER BY ${customers.created_at} ${direction}, ${customers.id} ${direction}
				LIMIT ${PAGE_SCAN_BATCH}
				${planetScaleTag({ query: "balanceFilterSparsePage" })}
			`);

			const exact = await exactRemainingByCustomer({
				db,
				internalFeatureId,
				internalCustomerIds: pageRows.map((row) => row.internal_customer_id),
			});
			for (const row of pageRows) {
				const exactRow = exact.get(row.internal_customer_id);
				// Absent = no live rows → non-holder → excluded by definition.
				if (exactRow === undefined) continue;
				if (
					thresholdRequiresFiniteRows(balance.basis) &&
					exactRow.finiteRows === 0
				) {
					continue;
				}
				if (
					passesBalanceFilter({
						total: basisValueOf({
							basis: balance.basis,
							remaining: exactRow.remaining,
							granted: exactRow.granted,
							unlimitedUsage: exactRow.unlimitedUsage,
						}),
						op: balance.op,
						value: balance.value,
					})
				) {
					internalIds.push(row.internal_customer_id);
				}
			}

			if (internalIds.length > limit) {
				return { internalIds: internalIds.slice(0, limit), hasMore: true };
			}
			if (pageRows.length < PAGE_SCAN_BATCH) {
				return { internalIds, hasMore: false };
			}
			const lastRow = pageRows[pageRows.length - 1];
			after = { t: Number(lastRow.created_at), id: lastRow.id };
		}

		logger.warn(
			`[balanceFilter] sparse top-up budget exhausted for feature ${internalFeatureId}: ${internalIds.length}/${limit} rows`,
		);
		return { internalIds: internalIds.slice(0, limit), hasMore: true };
	}

	// Dense walk: benchmarked sub-ms when matches are plentiful; the sparse
	// case is normally caught by the lake path above.
	const rows = await db.execute<{ internal_customer_id: string }>(sql`
		SELECT ${customers.internal_id} AS internal_customer_id
		FROM customers
		${exactBalanceLateralSql(internalFeatureId)}
		WHERE ${predicates.whereRaw}
			${cursorPredicate(cursor ?? null)}
			AND bal.live_rows > 0
			AND ${exactThresholdSql(balance)}
		ORDER BY ${customers.created_at} ${direction}, ${customers.id} ${direction}
		LIMIT ${limit + 1}
		${planetScaleTag({ query: "balanceFilterDenseWalk" })}
	`);

	const hasMore = rows.length > limit;
	return {
		internalIds: (hasMore ? rows.slice(0, limit) : rows).map(
			(row) => row.internal_customer_id,
		),
		hasMore,
	};
};
