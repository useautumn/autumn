import pLimit from "p-limit";

const ORCHESTRATOR_STRIPE_CONCURRENCY = 48;

const stripeRequestLimit = pLimit(ORCHESTRATOR_STRIPE_CONCURRENCY);

export const withStripeRequestSlot = <T>(
	request: () => Promise<T>,
): Promise<T> => stripeRequestLimit(request);

export const STRIPE_REQUEST_OPTIONS = {
	timeout: 20_000,
	maxNetworkRetries: 2,
} as const;
