import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "@server/external/stripe/common/stripeConstants.ts";
import { STRIPE_REQUEST_OPTIONS } from "@tw/helpers/stripeRequestBudget.ts";
import Stripe from "stripe";

export const TWD_POOL_TAG = "autumn_twd_pool";
export const TWD_STATE_TAG = "autumn_twd_state";
export const LEGACY_POOL_TAG = "autumn_tw_pool";
export const LEGACY_POOL_STATE_TAG = "autumn_tw_pool_state";
export const CONNECT_WEBHOOK_EVENTS = [
	...MAIN_STRIPE_EVENT_TYPES,
	...SYNC_STRIPE_EVENT_TYPES,
];

const clients = new Map<string, Stripe>();

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
