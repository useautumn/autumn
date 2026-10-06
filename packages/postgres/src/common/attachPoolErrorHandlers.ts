import type { Pool, PoolClient } from "pg";
import type { PostgresLogger } from "../types/postgresClient.js";

/** pg emits a dropped connection as an `error` event on the pool or the checked-out client; unheard, it kills the process. */
export const attachPoolErrorHandlers = ({
	ctx,
	pool,
	name,
}: {
	ctx: { logger?: PostgresLogger };
	pool: Pool;
	name: string;
}): void => {
	const activeClientErrorHandlers = new WeakMap<
		PoolClient,
		(error: Error & { code?: string }) => void
	>();

	pool.on("error", (err: Error & { code?: string }) => {
		ctx.logger?.warn("pg_pool_error", {
			type: "pg_pool_error",
			pool: name,
			pid: process.pid,
			error_code: err.code,
			error_name: err.name,
			error_message: err.message,
		});
	});

	pool.on("acquire", (client) => {
		const handleError = (err: Error & { code?: string }) => {
			ctx.logger?.warn("pg_client_error", {
				type: "pg_client_error",
				pool: name,
				pid: process.pid,
				error_code: err.code,
				error_name: err.name,
				error_message: err.message,
			});
		};

		activeClientErrorHandlers.set(client, handleError);
		client.on("error", handleError);
	});

	pool.on("release", (_error, client) => {
		const handleError = activeClientErrorHandlers.get(client);
		if (!handleError) return;

		client.off("error", handleError);
		activeClientErrorHandlers.delete(client);
	});
};
