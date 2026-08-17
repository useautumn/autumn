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
	Map<string, { remaining: number; granted: number; isUnlimited: boolean }>
> => {
	if (internalCustomerIds.length === 0) return new Map();

	const rows = await db.execute<{
		internal_customer_id: string;
		remaining: string | number;
		granted: string | number;
		is_unlimited: boolean;
	}>(sql`
		SELECT
			ce.internal_customer_id,
			COALESCE(SUM(ce.balance) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS remaining,
			COALESCE(SUM(
				COALESCE(e.allowance, 0) * COALESCE(cp.quantity, 1)
				+ COALESCE(ce.adjustment, 0)
			) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS granted,
			COALESCE(BOOL_OR(ce.unlimited), false) AS is_unlimited
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
				isUnlimited: Boolean(row.is_unlimited),
			},
		]),
	);
};

/** Lake candidate ids for the threshold, or null when the lake is unavailable
 * or the match set is too large for the IN-list path. */
const getLakeCandidateIds = async ({
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
}): Promise<string[] | null> => {
	if (!isMotherDuckConfigured()) return null;

	try {
		const md = await getMotherDuckResolverDb();
		const matchWhere = sql`internal_feature_id = ${internalFeatureId} AND ${balanceThresholdSql(
			{
				totalExpr: basisExprSql(balance.basis),
				op: balance.op,
				value: balance.value,
			},
		)}`;

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
		if (!Number.isFinite(matchCount) || matchCount > SPARSE_CANDIDATE_CAP) {
			return null;
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

		return [...candidateIds];
	} catch (error) {
		logger.warn(
			`[balanceFilter] lake candidate path unavailable, using dense walk: ${error}`,
		);
		return null;
	}
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

	const candidateIds = await getLakeCandidateIds({
		db,
		orgId,
		env,
		internalFeatureId,
		balance,
	});

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
					passesBalanceFilter({
						total: basisValueOf({ basis: balance.basis, ...exactRow }),
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
		JOIN LATERAL (
			SELECT
				COALESCE(SUM(ce.balance) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS total,
				COALESCE(SUM(
					COALESCE(e.allowance, 0) * COALESCE(cp.quantity, 1)
					+ COALESCE(ce.adjustment, 0)
				) FILTER (WHERE ce.unlimited IS NOT TRUE), 0) AS granted,
				COALESCE(BOOL_OR(ce.unlimited), false) AS is_unlimited,
				COUNT(*) AS live_rows
			FROM customer_entitlements ce
			LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
			LEFT JOIN entitlements e ON e.id = ce.entitlement_id
			WHERE ce.internal_customer_id = ${customers.internal_id}
				AND ce.internal_feature_id = ${internalFeatureId}
				AND ${liveCusEntPredicate()}
		) bal ON true
		WHERE ${predicates.whereRaw}
			${cursorPredicate(cursor ?? null)}
			AND bal.live_rows > 0
			AND ${balanceThresholdSql({
				totalExpr:
					balance.basis === "granted"
						? sql.raw("bal.granted")
						: balance.basis === "usage"
							? sql.raw("(bal.granted - bal.total)")
							: sql.raw("bal.total"),
				op: balance.op,
				value: balance.value,
			})}
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
