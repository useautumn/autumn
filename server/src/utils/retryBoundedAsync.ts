import { withTimeout } from "@autumn/shared";
import { retryAsync } from "@/utils/retryAsync.js";

/** retryAsync only retries a rejection, so a read that never settles needs a
 * deadline to reject at all — a hung socket otherwise waits forever. */
export const retryBoundedAsync = async <T>({
	attempts,
	delayMs,
	timeoutMs,
	timeoutMessage,
	run,
	onRetry,
}: {
	attempts: number;
	delayMs: number;
	timeoutMs: number;
	timeoutMessage: string;
	run: () => Promise<T>;
	onRetry?: ({ attempt, error }: { attempt: number; error: unknown }) => void;
}): Promise<T> =>
	retryAsync({
		attempts,
		delayMs,
		onRetry,
		run: () => withTimeout({ timeoutMs, timeoutMessage, fn: run }),
	});
