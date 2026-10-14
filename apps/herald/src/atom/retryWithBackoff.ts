export type RetryPolicy = {
	attempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
};

const sleepFor = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

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
