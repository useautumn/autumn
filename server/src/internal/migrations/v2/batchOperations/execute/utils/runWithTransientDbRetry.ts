import { isTransientDbError } from "@/db/dbUtils.js";

const sleep = ({ ms }: { ms: number }): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries `run` when Postgres drops the socket or times out the statement.
 * Claim/execute are replay-idempotent, so a failed page can start over.
 */
export const runWithTransientDbRetry = async <T>({
	run,
	maxAttempts,
	delayMs,
	onRetry,
}: {
	run: () => Promise<T>;
	maxAttempts: number;
	delayMs: number;
	onRetry?: (args: {
		error: unknown;
		attempt: number;
		maxAttempts: number;
	}) => void;
}): Promise<T> => {
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await run();
		} catch (error) {
			lastError = error;
			const canRetry =
				attempt < maxAttempts && isTransientDbError({ error });
			if (!canRetry) throw error;
			onRetry?.({ error, attempt, maxAttempts });
			await sleep({ ms: delayMs });
		}
	}
	throw lastError;
};
