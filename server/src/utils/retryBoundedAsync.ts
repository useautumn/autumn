import { withTimeout } from "@autumn/shared";
import { retryAsync } from "@/utils/retryAsync.js";

export class DeadlineExceededError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DeadlineExceededError";
	}
}

export const isDeadlineExceededError = (error: unknown): boolean =>
	error instanceof DeadlineExceededError;

/** retryAsync only retries a rejection, so a read that never settles needs a
 * deadline to reject at all — a hung socket otherwise waits forever. The
 * deadline is its own error type so only a stall is retried here: the Stripe
 * SDK already retries connection errors, 409, 429 and 5xx beneath us. */
export const retryBoundedAsync = async <T>({
	attempts,
	delayMs,
	maxDelayMs,
	timeoutMs,
	timeoutMessage,
	run,
	shouldRetry = isDeadlineExceededError,
	onRetry,
}: {
	attempts: number;
	delayMs: number;
	maxDelayMs?: number;
	timeoutMs: number;
	timeoutMessage: string;
	run: () => Promise<T>;
	shouldRetry?: (error: unknown) => boolean;
	onRetry?: ({ attempt, error }: { attempt: number; error: unknown }) => void;
}): Promise<T> =>
	retryAsync({
		attempts,
		delayMs,
		maxDelayMs,
		onRetry,
		shouldRetry,
		run: () =>
			withTimeout({
				timeoutMs,
				timeoutMessage,
				timeoutError: (message) => new DeadlineExceededError(message),
				fn: run,
			}),
	});
