import type { Pool, PoolClient, QueryConfig, QueryResult } from "pg";
import { isTransientDbError } from "@/db/dbUtils.js";

export type MigrationQuery = (
	config: string | QueryConfig,
	values?: unknown[],
) => Promise<QueryResult>;

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

/** Runs `run` in a transaction on a client this call owns: every statement is
 * deadlined, and a failed or aborted attempt destroys its connection. */
export const runMigrationTransaction = async <T>({
	pool,
	signal,
	queryTimeoutMs,
	maxAttempts,
	run,
}: {
	pool: Pool;
	signal: AbortSignal;
	queryTimeoutMs: number;
	maxAttempts: number;
	run: (query: MigrationQuery) => Promise<T>;
}): Promise<T> => {
	for (let attempt = 1; ; attempt++) {
		signal.throwIfAborted();
		const connection = createOwnedConnection({ pool, signal, queryTimeoutMs });
		let commitSent = false;
		try {
			await connection.acquire();
			await connection.query("BEGIN");
			const result = await connection.bounded({
				operation: () => run(connection.query),
				deadline: false,
			});
			commitSent = true;
			await connection.query("COMMIT");
			connection.release();
			return result;
		} catch (error) {
			const failure = connection.discard(error);
			// An accepted COMMIT may have lost only its reply; replaying could apply it twice.
			if (commitSent) throw new MigrationCommitUnknownError(failure);
			if (signal.aborted || attempt >= maxAttempts) throw failure;
			if (!isRetryableFailure(failure)) throw failure;
		} finally {
			connection.close();
		}
	}
};

const isRetryableFailure = (failure: unknown) =>
	failure instanceof MigrationDbDeadlineError ||
	isTransientDbError({ error: failure });

/** One attempt's pg client: statements race a deadline and the page abort, and
 * the first failure destroys the socket so nothing else runs on it. */
const createOwnedConnection = ({
	pool,
	signal,
	queryTimeoutMs,
}: {
	pool: Pool;
	signal: AbortSignal;
	queryTimeoutMs: number;
}) => {
	let client: PoolClient | undefined;
	let failure: unknown;
	let closed = false;
	const pendingRejects = new Set<(error: unknown) => void>();

	const discard = (error: unknown) => {
		failure ??= error;
		if (client && !closed) client.release(true);
		closed = true;
		for (const reject of pendingRejects) reject(failure);
		return failure;
	};
	const assertOpen = () => {
		signal.throwIfAborted();
		if (failure) throw failure;
		if (closed) throw new Error("batch-migration: transaction already closed");
	};
	const onAbort = () => discard(signal.reason);
	signal.addEventListener("abort", onAbort, { once: true });

	const bounded = <R>({
		operation,
		deadline = true,
	}: {
		operation: () => Promise<R>;
		deadline?: boolean;
	}): Promise<R> => {
		assertOpen();
		return new Promise<R>((resolve, reject) => {
			pendingRejects.add(reject);
			const timer = deadline
				? setTimeout(
						() => discard(new MigrationDbDeadlineError()),
						queryTimeoutMs,
					)
				: undefined;
			Promise.resolve()
				.then(() => {
					assertOpen();
					return operation();
				})
				.then(resolve, reject)
				.finally(() => {
					clearTimeout(timer);
					pendingRejects.delete(reject);
				});
		});
	};

	const acquire = async () => {
		client = await bounded({
			operation: async () => {
				const acquired = await pool.connect();
				// A connect that lands after the deadline is never handed out.
				if (failure || signal.aborted) {
					acquired.release(true);
					throw failure ?? signal.reason;
				}
				return acquired;
			},
		});
	};

	// pg runs one statement at a time per client; chaining starts each deadline at dispatch, not enqueue.
	let lastStatement: Promise<unknown> = Promise.resolve();
	const query: MigrationQuery = (config, values) => {
		const owned = client;
		if (!owned) throw new Error("batch-migration: connection not acquired");
		const statement = lastStatement
			.catch(() => undefined)
			.then(() => bounded({ operation: () => owned.query(config, values) }));
		lastStatement = statement;
		return statement;
	};

	const release = () => {
		closed = true;
		client?.release();
	};

	const close = () => {
		closed = true;
		signal.removeEventListener("abort", onAbort);
	};

	return { acquire, query, bounded, discard, release, close };
};
