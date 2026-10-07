import { trace } from "@opentelemetry/api";
import {
	DatabaseError,
	type PoolClient,
	type QueryConfig,
	type QueryResult,
} from "pg";
import { sqlCommand } from "./sqlCommand.js";
import type { ReportMigrationDbFailure } from "./types/reportMigrationDbFailure.js";

type QueryValues = unknown[] | undefined;
type QueryCallback = (error: Error | null, result?: QueryResult) => void;
type DispatchQuery = (
	config: string | QueryConfig,
	values: QueryValues,
	callback: (error: Error | null, result: QueryResult) => void,
) => void;

/** A server ERROR on COMMIT means Postgres rolled back; anything else may have committed. */
const isKnownCommitRejection = (error: Error) =>
	error instanceof DatabaseError && error.severity === "ERROR";

/** Bounds each statement on `client`; a lost reply retires the client with an outcome-unknown error. */
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
	let retirement: Error | undefined;
	// Serializes statements so each deadline starts at dispatch and work queued behind a retirement fails fast.
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
			if (retirement) return reject(retirement);
			const command = sqlCommand(
				typeof config === "string" ? config : config.text,
			);
			const startedAt = Date.now();
			trace.getActiveSpan()?.setAttribute("db.pool.name", "migration");

			const retire = (reason: "deadline" | "commit_unknown") => {
				// Stored on the item event; grep `outcome_unknown` before retrying failed items.
				retirement ??= new Error(
					`migration database outcome_unknown (${reason}): not retried`,
				);
				releaseOnce();
				reject(retirement);
				report({
					phase: "query",
					command,
					reason,
					elapsedMs: Date.now() - startedAt,
					client_process_id: (client as PoolClient & { processID?: number })
						.processID,
				});
			};
			const rejectKnown = (error: unknown) => {
				if (command === "BEGIN") releaseOnce();
				reject(error);
				report({
					phase: "query",
					command,
					reason: "error",
					code: (error as { code?: unknown }).code,
					message: error instanceof Error ? error.message : String(error),
					elapsedMs: Date.now() - startedAt,
				});
			};

			const timer = setTimeout(() => retire("deadline"), timeoutMs);
			try {
				dispatch(config, values, (error, result) => {
					clearTimeout(timer);
					if (retirement) return reject(retirement);
					if (!error) return resolve(result);
					if (command === "COMMIT" && !isKnownCommitRejection(error))
						return retire("commit_unknown");
					rejectKnown(error);
				});
			} catch (error) {
				clearTimeout(timer);
				rejectKnown(error);
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
