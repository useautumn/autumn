import { type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const POSTGRES_CANDIDATE_STATEMENT_TIMEOUT_MS = 2_000;

const orgTails = new Map<string, Promise<unknown>>();

/** One in-flight candidate query per org; later callers queue behind it. */
const runOnePerOrg = async <T>({
	orgId,
	run,
}: {
	orgId: string;
	run: () => Promise<T>;
}): Promise<T> => {
	const previous = orgTails.get(orgId) ?? Promise.resolve();
	const current = previous.then(run, run);
	const tail = current.catch(() => {});
	orgTails.set(orgId, tail);
	try {
		return await current;
	} finally {
		if (orgTails.get(orgId) === tail) orgTails.delete(orgId);
	}
};

const rowsOf = <T>(result: unknown): T[] => {
	if (Array.isArray(result)) return result as T[];
	if (result && typeof result === "object" && "rows" in result) {
		return (result as { rows: T[] }).rows;
	}
	return [];
};

/** Runs a candidate query under a transaction-scoped statement_timeout, one
 * at a time per org, so a dev-sized query can never turn expensive. */
export const runThrottledPostgresQuery = <T>({
	db,
	orgId,
	query,
}: {
	db: DrizzleCli;
	orgId: string;
	query: SQL;
}): Promise<T[]> =>
	runOnePerOrg({
		orgId,
		run: () =>
			db.transaction(async (tx) => {
				await tx.execute(
					sql.raw(
						`SET LOCAL statement_timeout = ${POSTGRES_CANDIDATE_STATEMENT_TIMEOUT_MS}`,
					),
				);
				return rowsOf<T>(await tx.execute(query));
			}),
	});
