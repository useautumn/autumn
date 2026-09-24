import { backoffDelayMs } from "@/utils/backoffDelayMs.js";
import { timeout } from "@/utils/genUtils.js";

/** Retries on throw only; a resolved value is always returned as-is.
 * `maxDelayMs` switches the wait from flat to exponential with jitter. */
export const retryAsync = async <T>({
	attempts,
	delayMs,
	maxDelayMs,
	run,
	shouldRetry,
	onRetry,
}: {
	attempts: number;
	delayMs: number;
	maxDelayMs?: number;
	run: () => Promise<T>;
	shouldRetry?: (error: unknown) => boolean;
	onRetry?: ({ attempt, error }: { attempt: number; error: unknown }) => void;
}): Promise<T> => {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (error) {
			if (shouldRetry && !shouldRetry(error)) throw error;
			if (attempt >= attempts) throw error;
			onRetry?.({ attempt, error });
			await timeout(
				maxDelayMs
					? backoffDelayMs({ attempt, baseDelayMs: delayMs, maxDelayMs })
					: delayMs,
			);
		}
	}
};
