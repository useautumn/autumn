import {
	type AppEnv,
	type BalanceFilterOp,
	type CustomerListFilters,
	customers,
	type FeatureBalanceCursorFields,
	type FeatureBalanceSortBasis,
	type SortOrder,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { withActiveSpan } from "@/utils/otel/withActiveSpan.js";
import {
	stripeSuppressed,
	thresholdRequiresFiniteRows,
	unlimitedPassesThreshold,
} from "./balanceCandidates/balanceTotalsSql.js";
import { getBalanceCandidateSource } from "./balanceCandidates/getBalanceCandidateSource.js";
import type { BalanceThresholdFilter } from "./balanceCandidates/types/balanceThresholdFilter.js";
import type { NominationCursor } from "./balanceCandidates/types/nominationCursor.js";
import { buildSearchPredicates } from "./CusSearchService.js";
import {
	activeStatusList,
	liveCusEntPredicate,
	unlimitedUsedSumSql,
} from "./liveCusEntSql.js";

/** `total` is the value of the REQUESTED basis (remaining/granted/usage) —
 * the cursor and ranking key on both the lake and PG sides. */
export type FeatureBalanceSortRow = {
	internalId: string;
	isUnlimited: boolean;
	total: number;
};

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

/** The scalar a threshold compares in the chosen basis. Usage spans ALL rows:
 * finite consumption plus unlimited-row deductions. */
export const basisValueOf = ({
	basis,
	remaining,
	granted,
	unlimitedUsage,
}: {
	basis: FeatureBalanceSortBasis;
	remaining: number;
	granted: number;
	unlimitedUsage: number;
}): number =>
	basis === "granted"
		? granted
		: basis === "usage"
			? granted - remaining + unlimitedUsage
			: remaining;

/** Remaining/granted thresholds compare finite sums (see
 * `thresholdRequiresFiniteRows`); usage thresholds compare all-rows usage. */
export const passesBalanceFilter = ({
	total,
	op,
	value,
}: {
	total: number;
	op: BalanceFilterOp;
	value: number;
}): boolean => (op === ">" ? total > value : total < value);

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
		unlimited_used: string | number;
		finite_rows: string | number;
	}>(sql`
		SELECT
			${customers.internal_id} AS internal_customer_id,
			COALESCE(b.is_unlimited, false) AS is_unlimited,
			COALESCE(b.remaining, 0) AS remaining,
			COALESCE(b.granted, 0) AS granted,
			COALESCE(b.unlimited_used, 0) AS unlimited_used,
			COALESCE(b.finite_rows, 0) AS finite_rows
		FROM customers
		LEFT JOIN (
			SELECT
				ce.internal_customer_id,
				COALESCE(BOOL_OR(ce.unlimited), false) AS is_unlimited,
				SUM(ce.balance) FILTER (WHERE ce.unlimited IS NOT TRUE) AS remaining,
				SUM(
					COALESCE(e.allowance, 0) * COALESCE(cp.quantity, 1)
					+ COALESCE(ce.adjustment, 0)
				) FILTER (WHERE ce.unlimited IS NOT TRUE) AS granted,
				${unlimitedUsedSumSql()} AS unlimited_used,
				COUNT(*) FILTER (WHERE ce.unlimited IS NOT TRUE) AS finite_rows
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
		const unlimitedUsage = Number(row.unlimited_used);
		const finiteRows = Number(row.finite_rows);
		if (remainingFilter) {
			const admittedAsUnlimited =
				Boolean(row.is_unlimited) && unlimitedPassesThreshold(remainingFilter);
			if (!admittedAsUnlimited) {
				if (thresholdRequiresFiniteRows(remainingFilter) && finiteRows === 0) {
					continue;
				}
				if (
					!passesBalanceFilter({
						total: basisValueOf({
							basis: remainingFilter.basis,
							remaining,
							granted,
							unlimitedUsage,
						}),
						op: remainingFilter.op,
						value: remainingFilter.value,
					})
				) {
					continue;
				}
			}
		}
		mapped.push({
			internalId: row.internal_customer_id,
			isUnlimited: stripeSuppressed({ basis, remainingFilter })
				? false
				: Boolean(row.is_unlimited),
			total: basisValueOf({ basis, remaining, granted, unlimitedUsage }),
		});
	}
	return mapped;
};

/** Search/full_customers/count fire together, so a cold cache otherwise runs
 * N copies of the multi-second scan — concurrent callers share one compute. */
const deflationInFlight = new Map<string, Promise<FeatureBalanceSortRow[]>>();

/** Cached exact rows for the deflation-exception customers. Values are up to
 * TTL stale, but they only steer RANKING — displayed numbers come from
 * hydration. Recompute is a feature-index scan (~seconds on whale features). */
export const getDeflationExceptionRows = ({
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
	const key = deflationSetCacheKey({ internalFeatureId, basis });
	const inFlight = deflationInFlight.get(key);
	if (inFlight) return inFlight;

	const compute = computeDeflationExceptionRows({
		db,
		orgId,
		env,
		internalFeatureId,
		basis,
	}).finally(() => {
		deflationInFlight.delete(key);
	});
	deflationInFlight.set(key, compute);
	return compute;
};

const computeDeflationExceptionRows = async ({
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
}): Promise<FeatureBalanceSortRow[]> =>
	withActiveSpan({
		name: "customer.balance_sort.deflation",
		attributes: {
			"customer.balance_sort.feature_internal_id": internalFeatureId,
			"customer.balance_sort.basis": basis,
		},
		fn: async (span) => {
			const miscRedis = getMiscRedis();
			const cacheKey = deflationSetCacheKey({ internalFeatureId, basis });

			const cached = await withActiveSpan({
				name: "customer.balance_sort.deflation.cache_lookup",
				fn: async (cacheSpan) => {
					const result = await tryRedisOp({
						operation: () => miscRedis.get(cacheKey),
						source: "balance-sort:deflation-set:get",
						redisInstance: miscRedis,
					});
					cacheSpan.setAttribute("cache.hit", Boolean(result));
					return result;
				},
			});
			if (cached) {
				const rows = (JSON.parse(cached) as [string, boolean, number][]).map(
					([internalId, isUnlimited, total]) => ({
						internalId,
						isUnlimited,
						total,
					}),
				);
				span.setAttributes({
					"customer.balance_sort.cache_hit": true,
					"customer.balance_sort.deflation_rows": rows.length,
				});
				return rows;
			}
			span.setAttribute("customer.balance_sort.cache_hit", false);

			// Deflation sources = negative rows the lake counts but the live definition
			// excludes: pooled contributions, and rows bound to non-active products
			// (status-based — the lazily-backfilled `expired` flag misses churned rows).
			const tStart = performance.now();
			const idRows = await withActiveSpan({
				name: "customer.balance_sort.deflation.scan",
				fn: async (scanSpan) => {
					const result = await db.execute<{ internal_customer_id: string }>(sql`
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
					scanSpan.setAttribute(
						"customer.balance_sort.candidate_rows",
						result.length,
					);
					return result;
				},
			});
			span.setAttribute(
				"customer.balance_sort.deflation_candidate_rows",
				idRows.length,
			);
			if (idRows.length >= DEFLATION_SET_CAP) {
				logger.warn(
					`[balanceSort] deflation set hit cap (${DEFLATION_SET_CAP}) for feature ${internalFeatureId} — under-ranked customers beyond the cap can be missed`,
				);
			}

			// Exact values computed without search/filters: the set is feature-scoped
			// and reused across requests; per-request predicates apply at merge time.
			const rows = await withActiveSpan({
				name: "customer.balance_sort.deflation.verify",
				attributes: {
					"customer.balance_sort.candidate_rows": idRows.length,
				},
				fn: async (verifySpan) => {
					const result =
						idRows.length === 0
							? []
							: await verifyExactBalances({
									db,
									orgId,
									env,
									search: "",
									filters: undefined,
									internalFeatureId,
									internalCustomerIds: idRows.map(
										(row) => row.internal_customer_id,
									),
									basis,
								});
					verifySpan.setAttribute(
						"customer.balance_sort.verified_rows",
						result.length,
					);
					return result;
				},
			});

			logger.info(
				`[balanceSort] deflation set for ${internalFeatureId}: ${rows.length} customers in ${(performance.now() - tStart).toFixed(0)}ms`,
			);

			await withActiveSpan({
				name: "customer.balance_sort.deflation.cache_write",
				attributes: {
					"customer.balance_sort.deflation_rows": rows.length,
					"cache.ttl_seconds": DEFLATION_SET_TTL_SECONDS,
				},
				fn: async () =>
					await tryRedisOp({
						operation: () =>
							miscRedis.set(
								cacheKey,
								JSON.stringify(
									rows.map((r) => [r.internalId, r.isUnlimited, r.total]),
								),
								"EX",
								DEFLATION_SET_TTL_SECONDS,
							),
						source: "balance-sort:deflation-set:set",
						redisInstance: miscRedis,
					}),
			});
			span.setAttribute("customer.balance_sort.deflation_rows", rows.length);
			return rows;
		},
	});

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

/**
 * Balance sort resolver: the candidate source (MotherDuck in production, a
 * throttled Postgres fallback elsewhere) nominates from per-customer totals, PG
 * verifies exact sums and re-ranks, topping up until the page fills. Only
 * feature HOLDERS appear: neither source has rows for non-holders.
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
}): Promise<{ rows: FeatureBalanceSortRow[]; hasMore: boolean }> =>
	withActiveSpan({
		name: "customer.balance_sort.resolve",
		attributes: {
			"customer.balance_sort.feature_internal_id": internalFeatureId,
			"customer.balance_sort.basis": basis,
			"customer.balance_sort.order": sortOrder,
			"customer.balance_sort.limit": limit,
			"customer.balance_sort.has_cursor": Boolean(cursor),
			"customer.balance_sort.has_search": Boolean(search.trim()),
			"customer.balance_sort.has_filters": Boolean(filters),
			"customer.balance_sort.has_threshold": Boolean(remainingFilter),
		},
		fn: async (span) => {
			const source = getBalanceCandidateSource();
			span.setAttribute("customer.balance_sort.backend", source.backend);

			const verifiedById = new Map<string, FeatureBalanceSortRow>();
			let iterationCount = 0;
			let nominationCount = 0;
			let verifiedCount = 0;

			// Deflation exceptions ride along from page one: their lake rank is wrong
			// by construction, so only their (cached-exact) values can place them.
			const exceptionRows = source.ranksExactly
				? []
				: await getDeflationExceptionRows({
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
				iterationCount = iteration + 1;
				const nominationRows = await withActiveSpan({
					name: "customer.balance_sort.nominate",
					attributes: {
						"customer.balance_sort.iteration": iteration,
						"customer.balance_sort.has_nomination_cursor":
							Boolean(nominationAfter),
					},
					fn: async (nominationSpan) => {
						const result = await source.nominate({
							db,
							orgId,
							env,
							createdAtRange: filters?.created_at_range,
							internalFeatureId,
							after: nominationAfter,
							sortOrder,
							basis,
							remainingFilter,
						});
						nominationSpan.setAttribute(
							"customer.balance_sort.nomination_rows",
							result.length,
						);
						return result;
					},
				});
				nominationCount += nominationRows.length;

				if (nominationRows.length < source.nominationBatchSize) {
					nominationsExhausted = true;
				}

				const freshIds = nominationRows
					.map((row) => row.internal_customer_id)
					.filter((id) => !verifiedById.has(id) && !exceptionIds.has(id));

				const verified = await withActiveSpan({
					name: "customer.balance_sort.verify",
					attributes: {
						"customer.balance_sort.iteration": iteration,
						"customer.balance_sort.verify_source": "nomination",
						"customer.balance_sort.candidate_rows": freshIds.length,
					},
					fn: async (verifySpan) => {
						const result = await verifyExactBalances({
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
						verifySpan.setAttribute(
							"customer.balance_sort.verified_rows",
							result.length,
						);
						return result;
					},
				});
				verifiedCount += verified.length;
				for (const row of verified) verifiedById.set(row.internalId, row);

				if (iteration === 0) {
					// Exceptions get per-request predicates applied via a verify pass too;
					// cached values only pre-place them when no search/filters narrow the set.
					const hasRequestPredicates = Boolean(
						search.trim() ||
							(filters &&
								Object.values(filters).some((v) => v !== undefined)) ||
							remainingFilter,
					);
					const placedExceptions = hasRequestPredicates
						? await withActiveSpan({
								name: "customer.balance_sort.verify",
								attributes: {
									"customer.balance_sort.iteration": iteration,
									"customer.balance_sort.verify_source": "deflation",
									"customer.balance_sort.candidate_rows": exceptionRows.length,
								},
								fn: async (verifySpan) => {
									const result = await verifyExactBalances({
										db,
										orgId,
										env,
										search,
										filters,
										internalFeatureId,
										internalCustomerIds: exceptionRows.map(
											(row) => row.internalId,
										),
										basis,
										remainingFilter,
									});
									verifySpan.setAttribute(
										"customer.balance_sort.verified_rows",
										result.length,
									);
									return result;
								},
							})
						: exceptionRows;
					verifiedCount += placedExceptions.length;
					for (const row of placedExceptions)
						verifiedById.set(row.internalId, row);
				}

				const pageCandidates = [...verifiedById.values()]
					.filter((row) => !cursor || isAfterCursor(row, cursor, sortOrder))
					.sort((a, b) => compareRows(a, b, sortOrder));

				if (pageCandidates.length > limit || nominationsExhausted) {
					span.setAttributes({
						"customer.balance_sort.iterations": iterationCount,
						"customer.balance_sort.nomination_rows": nominationCount,
						"customer.balance_sort.verified_rows": verifiedCount,
						"customer.balance_sort.result_rows": Math.min(
							pageCandidates.length,
							limit,
						),
						"customer.balance_sort.nominations_exhausted": nominationsExhausted,
					});
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
			span.setAttributes({
				"customer.balance_sort.iterations": iterationCount,
				"customer.balance_sort.nomination_rows": nominationCount,
				"customer.balance_sort.verified_rows": verifiedCount,
				"customer.balance_sort.result_rows": Math.min(
					pageCandidates.length,
					limit,
				),
				"customer.balance_sort.nominations_exhausted": nominationsExhausted,
				"customer.balance_sort.topup_budget_exhausted": true,
			});
			return { rows: pageCandidates.slice(0, limit), hasMore: true };
		},
	});
