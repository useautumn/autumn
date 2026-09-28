import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "@server/external/stripe/common/stripeConstants.ts";
import { STRIPE_REQUEST_OPTIONS } from "@tw/helpers/stripeRequestBudget.ts";
import Stripe from "stripe";

/** Tag scripts/tw/helpers/stripePool.ts stamps on pool accounts; twd keeps it for legacy interop. */
export const POOL_TAG = "autumn_tw_pool";
export const POOL_STATE_TAG = "autumn_tw_pool_state";
/** Same list scripts/tw registerConnectIngressWebhook subscribes to. */
export const CONNECT_WEBHOOK_EVENTS = [
	...MAIN_STRIPE_EVENT_TYPES,
	...SYNC_STRIPE_EVENT_TYPES,
];

const clients = new Map<string, Stripe>();

/**
 * Plain per-key Stripe client. Not @tw/helpers/stripeKeyPool's: that one pulls the
 * server's client cache + logger graph into twd's typecheck.
 */
export const stripeForKey = ({ secret }: { secret: string }): Stripe => {
	let client = clients.get(secret);
	if (!client) {
		client = new Stripe(secret, {
			timeout: STRIPE_REQUEST_OPTIONS.timeout,
			maxNetworkRetries: STRIPE_REQUEST_OPTIONS.maxNetworkRetries,
		});
		clients.set(secret, client);
	}
	return client;
};
