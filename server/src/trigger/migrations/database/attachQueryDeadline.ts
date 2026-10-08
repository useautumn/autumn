import { trace } from "@opentelemetry/api";
import type { PoolClient, QueryConfig, QueryResult } from "pg";
import { sqlCommand } from "./sqlCommand.js";
import type { ReportMigrationDbFailure } from "./types/reportMigrationDbFailure.js";

type QueryValues = unknown[] | undefined;
type QueryCallback = (error: Error | null, result?: QueryResult) => void;
type DispatchQuery = (
	config: string | QueryConfig,
	values: QueryValues,
	callback: (error: Error | null, result: QueryResult) => void,
) => void;

/** Bounds each statement on `client`; a statement past its deadline throws the connection away. */
export const attachQueryDeadline = ({
	client,
	timeoutMs,
	report,
}: {
	client: PoolClient;
	timeoutMs: number;
	report: ReportMigrationDbFailure;
}): void => {
	const dispatch = client.query.bind(client) as DispatchQuery;
	let deadlineError: Error | undefined;
	// Serializes statements so each deadline starts at dispatch and work queued behind a timeout fails fast.
	let statementQueue: Promise<unknown> = Promise.resolve();

	// Drizzle awaits BEGIN outside its release finally, so this owner must return the slot.
	const releaseOnce = () => {
		const release = client.release;
		client.release = () => {};
		release(true);
	};

	const runStatement = ({
		config,
		values,
	}: {
		config: string | QueryConfig;
		values: QueryValues;
	}) =>
		new Promise<QueryResult>((resolve, reject) => {
			if (deadlineError) return reject(deadlineError);
			const command = sqlCommand(
				typeof config === "string" ? config : config.text,
			);
			const startedAt = Date.now();
			trace.getActiveSpan()?.setAttribute("db.pool.name", "migration");

			const fail = ({ error, reason }: { error: unknown; reason: string }) => {
				reject(error);
				report({
					phase: "query",
					command,
					reason,
					code: (error as { code?: unknown }).code,
					message: error instanceof Error ? error.message : String(error),
					elapsedMs: Date.now() - startedAt,
					client_process_id: (client as PoolClient & { processID?: number })
						.processID,
				});
			};

			const timer = setTimeout(() => {
				deadlineError = new Error(
					`migration database query exceeded its ${timeoutMs}ms deadline`,
				);
				releaseOnce();
				fail({ error: deadlineError, reason: "deadline" });
			}, timeoutMs);

			const settle = (error: unknown, result?: QueryResult) => {
				clearTimeout(timer);
				if (deadlineError) return reject(deadlineError);
				if (!error) return resolve(result as QueryResult);
				if (command === "BEGIN") releaseOnce();
				fail({ error, reason: "error" });
			};

			try {
				dispatch(config, values, settle);
			} catch (error) {
				settle(error);
			}
		});

	const query = (
		config: string | QueryConfig,
		valuesOrCallback?: QueryValues | QueryCallback,
		callback?: QueryCallback,
	) => {
		const done =
			typeof valuesOrCallback === "function" ? valuesOrCallback : callback;
		const values =
			typeof valuesOrCallback === "function" ? undefined : valuesOrCallback;
		const statement = statementQueue
			.catch(() => undefined)
			.then(() => runStatement({ config, values }));
		statementQueue = statement;
		if (!done) return statement;
		statement.then(
			(result) => done(null, result),
			(error: Error) => done(error),
		);
	};

	client.query = query as PoolClient["query"];
};
