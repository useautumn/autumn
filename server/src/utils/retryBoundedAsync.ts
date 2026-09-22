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
	timeoutMs,
	timeoutMessage,
	run,
	beforeAttempt,
	shouldRetry = isDeadlineExceededError,
	onRetry,
}: {
	attempts: number;
	delayMs: number;
	timeoutMs: number;
	timeoutMessage: string;
	run: () => Promise<T>;
	beforeAttempt?: () => Promise<void> | void;
	shouldRetry?: (error: unknown) => boolean;
	onRetry?: ({ attempt, error }: { attempt: number; error: unknown }) => void;
}): Promise<T> =>
	retryAsync({
		attempts,
		delayMs,
		onRetry,
		shouldRetry,
		run: async () => {
			await beforeAttempt?.();
			return withTimeout({
				timeoutMs,
				timeoutMessage,
				timeoutError: (message) => new DeadlineExceededError(message),
				fn: run,
			});
		},
	});
