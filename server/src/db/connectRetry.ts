import type { Pool, PoolClient } from "pg";
import { logger } from "@/external/logtail/logtailUtils.js";

const JITTER_MIN_MS = 100;
const JITTER_RANGE_MS = 200;

export const connectRefusedRetryJitterMs = (): number =>
	JITTER_MIN_MS + Math.random() * JITTER_RANGE_MS;

/** Instance-local bouncer refusal — a fresh TCP flow likely hashes to another instance. */
const isConnectRefusalError = (error: Error & { code?: string }): boolean =>
	/no more connections allowed/i.test(error.message ?? "") ||
	error.code === "ECONNREFUSED";

type ConnectCallback = (
	err: Error | undefined,
	client: PoolClient | undefined,
	done: PoolClient["release"],
) => void;

const noopDone = (): void => {};

/** Retries refusal-class establishment failures once; checkout timeouts are
 *  demand (retrying amplifies) and never match, so they propagate untouched. */
export const applyConnectRefusedRetry = ({
	pool,
	name,
}: {
	pool: Pool;
	name: string;
}): void => {
	const original = pool.connect.bind(pool);

	const connectWithRetry = async (): Promise<PoolClient> => {
		try {
			return await original();
		} catch (error) {
			const refusal = error as Error & { code?: string };
			if (!isConnectRefusalError(refusal)) throw error;
			const delayMs = connectRefusedRetryJitterMs();
			logger.warn("pg_connect_refused_retry", {
				type: "pg_connect_refused_retry",
				pool: name,
				delayMs: Math.round(delayMs),
				error_code: refusal.code,
				error_message: refusal.message,
			});
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			return await original();
		}
	};

	const wrapped = (callback?: ConnectCallback) => {
		if (!callback) return connectWithRetry();
		connectWithRetry().then(
			(client) => callback(undefined, client, client.release.bind(client)),
			(error: Error) => callback(error, undefined, noopDone),
		);
		return;
	};

	pool.connect = wrapped as Pool["connect"];
};
