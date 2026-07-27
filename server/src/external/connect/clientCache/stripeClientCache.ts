import { LRUCache } from "lru-cache";
import type Stripe from "stripe";
import { applyTwStripeConcurrencyLimit } from "./twStripeConcurrencyLimit.js";

const THIRTY_MINUTES_MS = 1000 * 60 * 30;

const stripeClientCache = new LRUCache<string, Stripe>({
	max: 500,
	ttl: THIRTY_MINUTES_MS,
});

/** Returns a cached Stripe client for the given key, or creates and caches a new one. */
export const getOrCreateStripeClient = ({
	cacheKey,
	create,
}: {
	cacheKey: string;
	create: () => Stripe;
}): Stripe => {
	const cached = stripeClientCache.get(cacheKey);
	if (cached) return cached;

	// No-op unless TW_WORKER_MODE=1 — every Stripe client in the server is built
	// here, so the swarm's concurrency ceiling is enforced in one place.
	const client = applyTwStripeConcurrencyLimit({
		client: create(),
		cacheKey,
	});

	stripeClientCache.set(cacheKey, client);
	return client;
};
