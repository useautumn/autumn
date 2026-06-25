import Stripe from "stripe";
import { getOrCreateStripeClient } from "./clientCache/stripeClientCache.js";

/**
 * A cached Stripe client bound to an EXPLICIT secret key.
 *
 * Test-infra only: the `bun tw` swarm shards workers across a pool of platform
 * keys (`scripts/tw/helpers/stripeKeyPool.ts`) to multiply Stripe's per-key rate
 * limit, so the orchestrator needs a client per pool key. The app's own factories
 * (`initMasterStripe` / `initPlatformStripe`) only resolve keys from env / the
 * master org, and `scripts/` has no `stripe` dependency of its own — so this lives
 * here (server has `stripe`) and the orchestrator imports it via `@server/*`. It
 * is NOT used by any app request path.
 */
export const stripeClientForKey = (secretKey: string): Stripe =>
	getOrCreateStripeClient({
		cacheKey: `tw-key-pool:${secretKey}`,
		create: () => new Stripe(secretKey),
	});
