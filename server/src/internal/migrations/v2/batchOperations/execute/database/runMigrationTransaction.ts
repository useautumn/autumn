import { schemas } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient, QueryConfig, QueryResult } from "pg";
import { isTransientDbError } from "@/db/dbUtils.js";
import { type DrizzleCli, normalizeDbExecute } from "@/db/initDrizzle.js";

export class MigrationDbDeadlineError extends Error {
	constructor() {
		super("batch-migration: database operation deadline exceeded");
	}
}
export class MigrationCommitUnknownError extends Error {
	constructor(cause: unknown) {
		super(
			"batch-migration: COMMIT outcome unknown; transaction was not retried",
			{ cause },
		);
	}
}
export const runMigrationTransaction = async <T>({
	pool,
	signal,
	queryTimeoutMs,
	maxAttempts,
	run,
	transaction = true,
}: {
	pool: Pool;
	signal: AbortSignal;
	queryTimeoutMs: number;
	maxAttempts: number;
	run: (db: DrizzleCli) => Promise<T>;
	transaction?: boolean;
}): Promise<T> => {
	for (let attempt = 1; ; attempt++) {
		signal.throwIfAborted();
		let client: PoolClient | undefined;
		let failed: unknown;
		let released = false;
		let commitSent = false;
		const pending = new Set<(error: unknown) => void>();
		const discard = (error: unknown) => {
			failed ??= error;
			if (client && !released) {
				released = true;
				client.release(true);
			}
			for (const reject of pending) reject(failed);
		};
		const assertActive = () => {
			signal.throwIfAborted();
			if (failed) throw failed;
			if (released)
				throw new Error("batch-migration: transaction already closed");
		};
		const onAbort = () => discard(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		const bounded = <R>(
			operation: () => Promise<R>,
			deadline = true,
		): Promise<R> => {
			assertActive();
			return new Promise<R>((resolve, reject) => {
				pending.add(reject);
				const timer = deadline
					? setTimeout(
							() => discard(new MigrationDbDeadlineError()),
							queryTimeoutMs,
						)
					: undefined;
				Promise.resolve()
					.then(() => {
						assertActive();
						return operation();
					})
					.then(resolve, reject)
					.finally(() => {
						clearTimeout(timer);
						pending.delete(reject);
					});
			});
		};
		try {
			client = await bounded(async () => {
				const acquired = await pool.connect();
				if (failed || signal.aborted) {
					acquired.release(true);
					throw failed ?? signal.reason;
				}
				return acquired;
			});
			const ownedClient = client;
			const query = (
				config: string | QueryConfig,
				values?: unknown[],
			): Promise<QueryResult> =>
				bounded(() => ownedClient.query(config, values));
			const db = normalizeDbExecute(
				drizzle({ query } as PoolClient, { schema: schemas }),
			) as unknown as DrizzleCli;
			if (transaction) await query("BEGIN");
			const result = await bounded(() => run(db), false);
			assertActive();
			if (transaction) {
				commitSent = true;
				await query("COMMIT");
			}
			assertActive();
			released = true;
			client.release();
			return result;
		} catch (error) {
			discard(error);
			if (commitSent) throw new MigrationCommitUnknownError(error);
			const retryable =
				failed instanceof MigrationDbDeadlineError ||
				isTransientDbError({ error });
			if (
				!transaction ||
				commitSent ||
				signal.aborted ||
				attempt >= maxAttempts ||
				!retryable
			)
				throw error;
		} finally {
			signal.removeEventListener("abort", onAbort);
		}
	}
};
