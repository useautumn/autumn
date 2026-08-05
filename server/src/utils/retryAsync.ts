import { timeout } from "@/utils/genUtils.js";

/** Retries on throw only; a resolved value is always returned as-is. */
export const retryAsync = async <T>({
	attempts,
	delayMs,
	run,
	onRetry,
}: {
	attempts: number;
	delayMs: number;
	run: () => Promise<T>;
	onRetry?: ({ attempt, error }: { attempt: number; error: unknown }) => void;
}): Promise<T> => {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (error) {
			if (attempt >= attempts) throw error;
			onRetry?.({ attempt, error });
			await timeout(delayMs);
		}
	}
};
