import { type SQL, sql } from "drizzle-orm";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	basisExprSql,
	nominationClausesSql,
	totalsThresholdSql,
} from "../balanceTotalsSql.js";
import type {
	BalanceCandidateSource,
	NominationRow,
} from "../types/balanceCandidateSource.js";
import { postgresBalanceTotalsCte } from "./postgresBalanceTotalsSql.js";
import {
	POSTGRES_CANDIDATE_STATEMENT_TIMEOUT_MS,
	runThrottledPostgresQuery,
} from "./runThrottledPostgresQuery.js";

const POSTGRES_NOMINATION_BATCH_SIZE = 100;
const POSTGRES_MAX_PAGE_SIZE = 50;
const POSTGRES_CANDIDATE_CAP = 2_000;
const LOG_PREFIX = "[balanceCandidates:postgres-dev]";

const timed = async <T>({
	label,
	run,
}: {
	label: string;
	run: () => Promise<T[]>;
}): Promise<T[]> => {
	const startedAt = performance.now();
	const rows = await run();
	logger.info(
		`${LOG_PREFIX} ${label} rows=${rows.length} ${(performance.now() - startedAt).toFixed(0)}ms`,
	);
	return rows;
};

const nominate: BalanceCandidateSource["nominate"] = ({
	db,
	orgId,
	env,
	createdAtRange,
	internalFeatureId,
	after,
	sortOrder,
	basis,
	remainingFilter,
}) => {
	const { thresholdPredicate, cursorPredicate, orderBy } = nominationClausesSql(
		{ after, sortOrder, basis, remainingFilter },
	);
	const query = sql`
		${postgresBalanceTotalsCte({ orgId, env, internalFeatureId, createdAtRange })}
		SELECT internal_customer_id, is_unlimited, ${basisExprSql(basis)} AS total
		FROM ce_balance_totals
		WHERE true
		${thresholdPredicate}
		${cursorPredicate}
		ORDER BY ${orderBy}
		LIMIT ${POSTGRES_NOMINATION_BATCH_SIZE}
	`;
	return timed({
		label: `nominate feature=${internalFeatureId} basis=${basis}`,
		run: () => runThrottledPostgresQuery<NominationRow>({ db, orgId, query }),
	});
};

const matchThreshold: BalanceCandidateSource["matchThreshold"] = async ({
	db,
	orgId,
	env,
	internalFeatureId,
	balance,
	candidateCap,
}) => {
	const cap = Math.min(candidateCap, POSTGRES_CANDIDATE_CAP);
	const matchingTotals = (select: SQL): SQL => sql`
		${postgresBalanceTotalsCte({ orgId, env, internalFeatureId })}
		${select}
		FROM ce_balance_totals
		WHERE ${totalsThresholdSql(balance)}
	`;

	const [countRow] = await timed({
		label: `matchCount feature=${internalFeatureId} op=${balance.op}`,
		run: () =>
			runThrottledPostgresQuery<{ n: number | string }>({
				db,
				orgId,
				query: matchingTotals(sql`SELECT COUNT(*) AS n`),
			}),
	});
	const matchCount = Number(countRow?.n ?? 0);
	if (matchCount > cap) return { matchCount, candidateIds: null };

	const idRows = await timed({
		label: `matchIds feature=${internalFeatureId} op=${balance.op}`,
		run: () =>
			runThrottledPostgresQuery<{ internal_customer_id: string }>({
				db,
				orgId,
				query: sql`${matchingTotals(sql`SELECT internal_customer_id`)} LIMIT ${cap}`,
			}),
	});
	return {
		matchCount,
		candidateIds: idRows.map((row) => row.internal_customer_id),
	};
};

/** Dev/test candidate source: totals computed live in Postgres, throttled. It
 * was moved to MotherDuck for cost, so constructing it in production throws. */
export const createPostgresBalanceCandidateSource =
	(): BalanceCandidateSource => {
		if (process.env.NODE_ENV === "production") {
			throw new Error(
				`${LOG_PREFIX} the Postgres balance candidate source must never run in production`,
			);
		}
		logger.warn(
			`${LOG_PREFIX} balance sort/filter using the Postgres dev fallback (statement_timeout=${POSTGRES_CANDIDATE_STATEMENT_TIMEOUT_MS}ms, batch=${POSTGRES_NOMINATION_BATCH_SIZE}, page<=${POSTGRES_MAX_PAGE_SIZE}, cap=${POSTGRES_CANDIDATE_CAP}, one query per org)`,
		);
		return {
			backend: "postgres",
			ranksExactly: true,
			nominationBatchSize: POSTGRES_NOMINATION_BATCH_SIZE,
			maxPageSize: POSTGRES_MAX_PAGE_SIZE,
			isAvailable: () => true,
			nominate,
			matchThreshold,
		};
	};
