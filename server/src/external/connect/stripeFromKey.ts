import Stripe from "stripe";
import { getOrCreateStripeClient } from "./clientCache/stripeClientCache.js";

export const stripeClientForKey = (secretKey: string): Stripe =>
	getOrCreateStripeClient({
		cacheKey: `tw-key-pool:${secretKey}`,
		create: () => new Stripe(secretKey),
	});
