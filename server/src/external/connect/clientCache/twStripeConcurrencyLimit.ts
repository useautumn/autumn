import type Stripe from "stripe";

/**
 * Bounds how many Stripe requests a swarm worker keeps IN FLIGHT at once.
 *
 * Stripe sheds load two ways: a per-second request rate, and a cap on
 * concurrent requests to the same endpoint. The second one is what the `bun tw`
 * swarm trips — a worker running `test.concurrent` files fires whole batches of
 * setup calls (products, prices, customers, payment methods) simultaneously on
 * ONE pool key, and Stripe answers with
 *
 *   429 rate_limit  ·  stripe-rate-limited-reason: endpoint-concurrency
 *
 * Measured from a laptop against a single healthy key: 30 concurrent calls at
 * ~190 req/s all succeed, while 60 concurrent sheds ~9. So the ceiling is
 * width, not speed — queueing requests costs almost nothing while going wide
 * fails outright.
 *
 * Stripe sends no `Retry-After` and no `Stripe-Should-Retry` on these, so the
 * backoff has to be ours.
 *
 * TEST-INFRA ONLY: applied when `TW_WORKER_MODE === "1"`, which the orchestrator
 * injects into every worker sandbox. App request paths are untouched.
 */

/**
 * Two ceilings, because Stripe sheds on both and fixing one exposes the other.
 * Measured against a single healthy key with the semaphore alone at 20 in
 * flight: 60 calls all succeed, 120 sheds 4, 240 sheds 116 — capping width lets
 * throughput climb past the ~25 req/s test-mode rate limit instead.
 *
 * Budgets are PER PROCESS, and a worker runs four that share one key (server,
 * queue workers, cron, and the `bun test` process itself), so the defaults are
 * deliberately about a quarter of what one process could get away with alone.
 */
const readBudget = ({
	envVar,
	fallback,
}: {
	envVar: string;
	fallback: number;
}): number => {
	const parsed = Number.parseInt(process.env[envVar] ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_IN_FLIGHT = readBudget({
	envVar: "TW_STRIPE_MAX_INFLIGHT",
	fallback: 8,
});
const MAX_REQUESTS_PER_SECOND = readBudget({
	envVar: "TW_STRIPE_MAX_RPS",
	fallback: 6,
});
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 250;

const PATCHED = new WeakSet<object>();

type StripeHttpClient = NonNullable<Stripe.StripeConfig["httpClient"]>;
type MakeRequestArgs = Parameters<StripeHttpClient["makeRequest"]>;
type StripeResponse = Awaited<ReturnType<StripeHttpClient["makeRequest"]>>;

export const isTwWorkerMode = (): boolean => process.env.TW_WORKER_MODE === "1";

/** Counting semaphore: resolves a waiter as each slot is released. */
const createSemaphore = ({ limit }: { limit: number }) => {
	let inFlight = 0;
	const waiting: Array<() => void> = [];

	const release = () => {
		inFlight--;
		const next = waiting.shift();
		if (next) next();
	};

	const acquire = async (): Promise<() => void> => {
		if (inFlight >= limit) {
			await new Promise<void>((resolve) => waiting.push(resolve));
		}
		inFlight++;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			release();
		};
	};

	return { acquire };
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Token bucket refilled continuously at `perSecond`. Callers await a token, so
 * a burst drains the bucket and then paces at the refill rate rather than
 * failing — the same trade the semaphore makes for width.
 */
const createRateLimiter = ({ perSecond }: { perSecond: number }) => {
	const intervalMs = 1000 / perSecond;
	let nextSlotAt = 0;

	const take = async (): Promise<void> => {
		const now = Date.now();
		const slot = Math.max(now, nextSlotAt);
		nextSlotAt = slot + intervalMs;

		const waitMs = slot - now;
		if (waitMs > 0) await sleep(waitMs);
	};

	return { take };
};

/** Budgets are per cache key, so each pool key gets its own pair. */
type KeyBudget = {
	semaphore: ReturnType<typeof createSemaphore>;
	rateLimiter: ReturnType<typeof createRateLimiter>;
};

const budgets = new Map<string, KeyBudget>();

const budgetFor = ({ cacheKey }: { cacheKey: string }): KeyBudget => {
	const existing = budgets.get(cacheKey);
	if (existing) return existing;

	const created: KeyBudget = {
		semaphore: createSemaphore({ limit: MAX_IN_FLIGHT }),
		rateLimiter: createRateLimiter({ perSecond: MAX_REQUESTS_PER_SECOND }),
	};
	budgets.set(cacheKey, created);
	return created;
};

const isConcurrencyShed = ({
	response,
}: {
	response: StripeResponse;
}): boolean => {
	try {
		return response.getStatusCode() === 429;
	} catch {
		return false;
	}
};

const getStripeHttpClient = ({ client }: { client: Stripe }) => {
	try {
		return (client as unknown as { _api?: { httpClient?: StripeHttpClient } })
			._api?.httpClient;
	} catch {
		return undefined;
	}
};

/**
 * Patches the client's HTTP layer — the single chokepoint every resource method
 * funnels through, so no call site needs to know about this.
 */
export const applyTwStripeConcurrencyLimit = ({
	client,
	cacheKey,
}: {
	client: Stripe;
	cacheKey: string;
}): Stripe => {
	if (!isTwWorkerMode()) return client;

	const httpClient = getStripeHttpClient({ client });
	if (!httpClient || PATCHED.has(httpClient)) return client;
	PATCHED.add(httpClient);

	const { semaphore, rateLimiter } = budgetFor({ cacheKey });
	const originalMakeRequest = httpClient.makeRequest.bind(httpClient);

	httpClient.makeRequest = async function limitedMakeRequest(
		...args: MakeRequestArgs
	) {
		for (let attempt = 0; ; attempt++) {
			await rateLimiter.take();
			const release = await semaphore.acquire();

			let response: StripeResponse;
			try {
				response = await originalMakeRequest(...args);
			} finally {
				release();
			}

			const shouldRetry =
				attempt < MAX_RETRIES && isConcurrencyShed({ response });

			if (!shouldRetry) return response;

			// Stripe sends no Retry-After here, so back off on our own schedule.
			await sleep(BASE_BACKOFF_MS * 2 ** attempt);
		}
	};

	return client;
};
