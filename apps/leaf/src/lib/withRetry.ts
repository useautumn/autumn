const wait = (delayMs: number) =>
	new Promise((resolve) => setTimeout(resolve, delayMs));

/** Runs the operation with exponential backoff: attempt n waits
 * baseDelayMs * 2^(n-1) before retrying. `shouldRetry` decides per error —
 * anything it declines is rethrown immediately. */
export const withRetry = async <T>({
	attempts,
	baseDelayMs,
	operation,
	shouldRetry,
}: {
	attempts: number;
	baseDelayMs: number;
	operation: () => Promise<T>;
	shouldRetry: (error: unknown, attempt: number) => boolean;
}): Promise<T> => {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			if (attempt >= attempts || !shouldRetry(error, attempt)) throw error;
			await wait(baseDelayMs * 2 ** (attempt - 1));
		}
	}
};
