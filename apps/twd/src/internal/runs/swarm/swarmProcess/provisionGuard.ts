const TRANSIENT =
	/RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|rate limit|too many requests/i;

/** Modal control-plane throttling during a wide fan-out; worth retrying, unlike a real boot failure. */
export const isTransientModalError = (error: unknown) =>
	TRANSIENT.test(error instanceof Error ? error.message : String(error));

export const withTransientRetry = async <T>({
	run,
	tries = 6,
	baseDelayMs = 2_000,
}: {
	run: () => Promise<T>;
	tries?: number;
	baseDelayMs?: number;
}): Promise<T> => {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (error) {
			if (attempt >= tries || !isTransientModalError(error)) throw error;
			const jitter = 0.5 + Math.random();
			await Bun.sleep(baseDelayMs * 2 ** (attempt - 1) * jitter);
		}
	}
};

/** Trips only on `limit` failures in a row, so a few flaky forks in a 3,000-wide run don't stop it. */
export const createFailureBreaker = ({ limit }: { limit: number }) => {
	let consecutive = 0;
	return {
		success: () => {
			consecutive = 0;
		},
		failure: () => {
			consecutive++;
		},
		tripped: () => consecutive >= limit,
	};
};
