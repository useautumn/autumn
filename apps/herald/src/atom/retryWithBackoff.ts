/** Bounded on both sides: at most `attempts` tries, and no wait longer than `maxDelayMs`. */
export type RetryPolicy = {
	/** Tries in total, the first included. */
	attempts: number;
	/** The first wait; each later one doubles, up to `maxDelayMs`. */
	baseDelayMs: number;
	maxDelayMs: number;
};

const sleepFor = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Equal jitter: half the wait is always served, the rest is spread so pushes that failed together do not return in step. */
const delayBeforeRetry = ({
	policy,
	attempt,
}: {
	policy: RetryPolicy;
	attempt: number;
}): number => {
	const ceiling = Math.min(
		policy.baseDelayMs * 2 ** (attempt - 1),
		policy.maxDelayMs,
	);
	return ceiling / 2 + (Math.random() * ceiling) / 2;
};

/** Tries again after a failure that can recover, waiting longer each time; throws the last error once the attempts are spent. */
export const retryWithBackoff = async <Result>({
	policy,
	run,
	shouldRetry,
}: {
	policy: RetryPolicy;
	run: () => Promise<Result>;
	shouldRetry: (error: unknown) => boolean;
}): Promise<Result> => {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (error) {
			const isLastAttempt = attempt >= policy.attempts;
			if (isLastAttempt || !shouldRetry(error)) throw error;
			await sleepFor(delayBeforeRetry({ policy, attempt }));
		}
	}
};
