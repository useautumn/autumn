const TRANSIENT = /RESOURCE_EXHAUSTED|rate limit|too many requests/i;

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
