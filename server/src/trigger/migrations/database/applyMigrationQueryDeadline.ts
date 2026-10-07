import { trace } from "@opentelemetry/api";
import type { Pool, PoolClient, QueryConfig, QueryResult } from "pg";

export const applyMigrationQueryDeadline = ({
	pool,
	queryTimeoutMs,
	onFailure,
}: {
	pool: Pool;
	queryTimeoutMs: number;
	onFailure?: (fields: Record<string, unknown>) => void;
}): void => {
	const reportFailure = (fields: Record<string, unknown>) => {
		const span = trace.getActiveSpan();
		try {
			onFailure?.({
				pool: "migration",
				total: pool.totalCount,
				idle: pool.idleCount,
				waiting: pool.waitingCount,
				trace_id: span?.spanContext().traceId,
				span_id: span?.spanContext().spanId,
				...fields,
			});
		} catch {}
	};
	const connect = pool.connect.bind(pool);
	const connectWithDiagnostics = (
		callback?: (
			error: Error | undefined,
			client?: PoolClient,
			done?: PoolClient["release"],
		) => void,
	) => {
		const startedAt = Date.now();
		const acquired = connect().catch((error: unknown) => {
			reportFailure({ phase: "acquire", elapsedMs: Date.now() - startedAt });
			throw error;
		});
		if (!callback) return acquired;
		acquired.then(
			(client) => callback(undefined, client, client.release.bind(client)),
			(error: Error) => callback(error, undefined, () => {}),
		);
	};
	pool.connect = connectWithDiagnostics as Pool["connect"];

	pool.on("connect", (client) => {
		let failure: Error | undefined;
		let previous: Promise<unknown> = Promise.resolve();
		const query = client.query.bind(client) as (
			config: string | QueryConfig,
			values: unknown[] | undefined,
			callback: (error: Error | null, result: QueryResult) => void,
		) => void;
		// Drizzle awaits BEGIN outside its release finally, so this owner must return the slot.
		const discardClient = () => {
			const release = client.release;
			client.release = () => {};
			release(true);
		};

		const queryWithDeadline = (
			config: string | QueryConfig,
			values?:
				| unknown[]
				| ((error: Error | null, result?: QueryResult) => void),
			callback?: (error: Error | null, result?: QueryResult) => void,
		) => {
			const done = typeof values === "function" ? values : callback;
			const parameters = typeof values === "function" ? undefined : values;
			const statement = previous
				.catch(() => undefined)
				.then(() => {
					if (failure) throw failure;
					const text = typeof config === "string" ? config : config.text;
					const verb = text.trimStart().split(/\s/, 1)[0].toUpperCase();
					const command =
						/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET)$/.test(
							verb,
						)
							? verb
							: "OTHER";
					const startedAt = Date.now();
					const span = trace.getActiveSpan();
					span?.setAttribute("db.pool.name", "migration");
					return new Promise<QueryResult>((resolve, reject) => {
						const retire = (reason: "deadline" | "commit_unknown") => {
							failure ??= new Error(
								`migration database ${reason}: outcome unknown; not retried`,
							);
							discardClient();
							reject(failure);
							reportFailure({
								phase: "query",
								command,
								reason,
								elapsedMs: Date.now() - startedAt,
								client_process_id: (
									client as PoolClient & { processID?: number }
								).processID,
							});
						};
						const rejectKnown = (error: unknown) => {
							if (command === "BEGIN") discardClient();
							reject(error);
						};
						const timer = setTimeout(() => retire("deadline"), queryTimeoutMs);
						try {
							query(config, parameters, (error, result) => {
								clearTimeout(timer);
								if (failure) return reject(failure);
								if (error && command === "COMMIT")
									return retire("commit_unknown");
								if (error) return rejectKnown(error);
								resolve(result);
							});
						} catch (error) {
							clearTimeout(timer);
							rejectKnown(error);
						}
					});
				});
			previous = statement;
			if (!done) return statement;
			statement.then(
				(result) => done(null, result),
				(error: Error) => done(error),
			);
		};

		client.query = queryWithDeadline as PoolClient["query"];
	});
};
