import type { Pool, PoolClient } from "pg";
import type { ReportMigrationDbFailure } from "./types/reportMigrationDbFailure.js";

type ConnectCallback = (
	error: Error | undefined,
	client?: PoolClient,
	done?: (error?: Error | boolean) => void,
) => void;

/** Reports failed checkouts, which fail before any per-client query wrapper exists. */
export const instrumentPoolAcquire = ({
	pool,
	report,
}: {
	pool: Pool;
	report: ReportMigrationDbFailure;
}): void => {
	const connect = pool.connect.bind(pool);

	const connectAndReport = async (): Promise<PoolClient> => {
		const startedAt = Date.now();
		try {
			return await connect();
		} catch (error) {
			report({ phase: "acquire", elapsedMs: Date.now() - startedAt });
			throw error;
		}
	};

	const instrumentedConnect = (callback?: ConnectCallback) => {
		if (!callback) return connectAndReport();
		// pg-pool's own pool.query checks out through this callback form.
		connectAndReport().then(
			(client) => callback(undefined, client, (error) => client.release(error)),
			(error: Error) => callback(error, undefined, () => {}),
		);
	};

	pool.connect = instrumentedConnect as Pool["connect"];
};
