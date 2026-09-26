import pLimit from "p-limit";

/** In-flight Stripe requests across all pool keys: a burst of ≳80 new connections
 * stalls some for the SDK's 80s timeout (152 lists: 78s unbounded, 8.2s at 48). */
const ORCHESTRATOR_STRIPE_CONCURRENCY = 48;

const stripeRequestLimit = pLimit(ORCHESTRATOR_STRIPE_CONCURRENCY);

/** Run ONE Stripe request inside the shared budget (never nest another slot inside). */
export const withStripeRequestSlot = <T>(
	request: () => Promise<T>,
): Promise<T> => stripeRequestLimit(request);

/** Bounded retries so a stray stalled request costs seconds, not the 80s default. */
export const STRIPE_REQUEST_OPTIONS = {
	timeout: 20_000,
	maxNetworkRetries: 2,
} as const;
