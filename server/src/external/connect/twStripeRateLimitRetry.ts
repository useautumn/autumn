import type Stripe from "stripe";

/**
 * tw-swarm seam: retry-on-429 for the test harness only, same gate as
 * stripeRetryOptions/twWorkerStripeKey. The SDK's maxNetworkRetries never
 * retries 429s (RequestSender._shouldRetry: connection errors, 409, 5xx,
 * stripe-should-retry only), so rate-limit collateral kills tests outright.
 * Deliberately NOT enabled in prod: blind retries on non-idempotent billing
 * calls risk double-charging when a request succeeded but the response died.
 */
const isTwWorkerHarness = (): boolean =>
	process.env.TW_WORKER_MODE === "1" &&
	process.env.NODE_ENV !== "production";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

const isRateLimitError = (error: unknown): boolean => {
	const e = error as { statusCode?: number; code?: string; type?: string };
	return (
		e?.statusCode === 429 ||
		e?.code === "rate_limit" ||
		e?.type === "StripeRateLimitError"
	);
};

/** Exponential backoff with jitter; honors Stripe's Retry-After when larger. */
const retryDelayMs = (attempt: number, error: unknown): number => {
	const headers = (error as { headers?: Record<string, string> })?.headers;
	const retryAfterSec = Number(headers?.["retry-after"]);
	const backoff = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
	const jittered = backoff * (0.5 + Math.random() * 0.5);
	return Number.isFinite(retryAfterSec) && retryAfterSec > 0
		? Math.max(retryAfterSec * 1000, jittered)
		: jittered;
};

const wrapFn = (
	fn: (...args: unknown[]) => unknown,
	self: unknown,
): ((...args: unknown[]) => unknown) =>
	function wrapped(...args: unknown[]) {
		const invoke = () => Reflect.apply(fn, self, args);
		const first = invoke();
		// Sync return (config getters etc.) — pass through untouched.
		if (!(first && typeof (first as Promise<unknown>).then === "function")) {
			return first;
		}
		// Stripe list results are async-iterable (`for await` auto-pagination);
		// rewrapping into a plain promise strips that protocol — pass through
		// unwrapped and un-retried rather than break iteration.
		if (
			typeof (first as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
			"function"
		) {
			return first;
		}
		return (async () => {
			let attempt = 0;
			let pending = first as Promise<unknown>;
			for (;;) {
				try {
					return await pending;
				} catch (error) {
					if (!isRateLimitError(error) || attempt >= MAX_RETRIES) {
						throw error;
					}
					await new Promise((resolve) =>
						setTimeout(resolve, retryDelayMs(attempt, error)),
					);
					attempt += 1;
					pending = invoke() as Promise<unknown>;
				}
			}
		})();
	};

const wrapNamespace = <T extends object>(target: T): T =>
	new Proxy(target, {
		get(t, prop, _receiver) {
			const value = Reflect.get(t, prop, t);
			if (typeof prop !== "string" || prop.startsWith("_")) return value;
			if (typeof value === "function") {
				return wrapFn(value as (...args: unknown[]) => unknown, t);
			}
			if (value && typeof value === "object" && !Array.isArray(value)) {
				return wrapNamespace(value);
			}
			return value;
		},
	});

/** Identity outside the tw worker harness — prod clients are untouched. */
export const withTwStripeRateLimitRetry = (client: Stripe): Stripe => {
	if (!isTwWorkerHarness()) return client;
	return wrapNamespace(client);
};
