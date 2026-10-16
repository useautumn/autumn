import { sql } from "drizzle-orm";
import { totalsThresholdSql } from "@/internal/customers/balanceCandidates/balanceTotalsSql.js";
import type {
	BalanceCandidateSource,
	NominationRow,
} from "@/internal/customers/balanceCandidates/types/balanceCandidateSource.js";
import {
	getMotherDuckResolverDb,
	isMotherDuckConfigured,
	runMdWithTimeout,
} from "../initMotherDuck.js";
import {
	MOTHERDUCK_NOMINATION_BATCH_SIZE,
	nominationQuery,
} from "./motherDuckNominationQuery.js";

/** Balance-mode pages are verify-bounded: nominations + exact PG re-rank. */
const MOTHERDUCK_MAX_PAGE_SIZE = 250;

const rowsOf = <T>(result: unknown): T[] => {
	if (Array.isArray(result)) return result as T[];
	if (result && typeof result === "object" && "rows" in result) {
		return (result as { rows: T[] }).rows;
	}
	return [];
};

const nominate: BalanceCandidateSource["nominate"] = async ({
	orgId,
	env,
	createdAtRange,
	internalFeatureId,
	after,
	sortOrder,
	basis,
	remainingFilter,
}) => {
	const md = await getMotherDuckResolverDb();
	const result = await runMdWithTimeout({
		label: "balance-sort nomination",
		run: () =>
			md.execute(
				nominationQuery({
					orgId,
					env,
					createdAtRange,
					internalFeatureId,
					after,
					sortOrder,
					basis,
					remainingFilter,
				}),
			),
	});
	return result as unknown as NominationRow[];
};

const matchThreshold: BalanceCandidateSource["matchThreshold"] = async ({
	internalFeatureId,
	balance,
	candidateCap,
}) => {
	const md = await getMotherDuckResolverDb();
	const matchWhere = sql`internal_feature_id = ${internalFeatureId} AND ${totalsThresholdSql(balance)}`;

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
	if (matchCount > candidateCap) return { matchCount, candidateIds: null };

	const idRows = rowsOf<{ internal_customer_id: string }>(
		await runMdWithTimeout({
			label: "balance-filter candidates",
			run: () =>
				md.execute(
					sql`SELECT internal_customer_id FROM main.ce_balance_totals WHERE ${matchWhere}`,
				),
		}),
	);
	return {
		matchCount,
		candidateIds: idRows.map((row) => row.internal_customer_id),
	};
};

/** Production candidate source: the MotherDuck `ce_balance_totals` cache
 * (approximate, ~5min stale), unavailable without a token. */
export const createMotherDuckBalanceCandidateSource =
	(): BalanceCandidateSource => ({
		backend: "motherduck",
		ranksExactly: false,
		nominationBatchSize: MOTHERDUCK_NOMINATION_BATCH_SIZE,
		maxPageSize: MOTHERDUCK_MAX_PAGE_SIZE,
		isAvailable: isMotherDuckConfigured,
		nominate,
		matchThreshold,
	});
