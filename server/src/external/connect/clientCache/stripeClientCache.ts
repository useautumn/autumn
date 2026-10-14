import { LRUCache } from "lru-cache";
import type Stripe from "stripe";
import { applyTwStripeConcurrencyLimit } from "./twStripeConcurrencyLimit.js";

const THIRTY_MINUTES_MS = 1000 * 60 * 30;

const stripeClientCache = new LRUCache<string, Stripe>({
	max: 500,
	ttl: THIRTY_MINUTES_MS,
});

export const getOrCreateStripeClient = ({
	cacheKey,
	create,
}: {
	cacheKey: string;
	create: () => Stripe;
}): Stripe => {
	const cached = stripeClientCache.get(cacheKey);
	if (cached) return cached;

	const client = applyTwStripeConcurrencyLimit({
		client: create(),
	});

	stripeClientCache.set(cacheKey, client);
	return client;
};
