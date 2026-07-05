import Stripe from "stripe";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "../../../server/src/external/stripe/common/stripeConstants.ts";
import { log } from "./shell.ts";

const CONNECT_PATH = "/webhooks/connect/sandbox";

function stripeClient(): Stripe | undefined {
	const key = process.env.STRIPE_SANDBOX_SECRET_KEY;
	return key ? new Stripe(key) : undefined;
}

async function findEndpoint(
	stripe: Stripe,
	url: string,
): Promise<Stripe.WebhookEndpoint | undefined> {
	for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
		if (endpoint.url === url) return endpoint;
	}
	return undefined;
}

// Idempotent by URL: reused across `bun d` restarts and setup re-runs. The
// server pairs with STRIPE_WEBHOOK_SKIP_VERIFY=true, so no secret is stored.
export async function ensureConnectWebhook(baseUrl: string): Promise<void> {
	const stripe = stripeClient();
	if (!stripe) {
		log("stripe webhook: STRIPE_SANDBOX_SECRET_KEY unset, skipping");
		return;
	}
	const url = `${baseUrl}${CONNECT_PATH}`;
	if (await findEndpoint(stripe, url)) {
		log(`stripe webhook endpoint reused: ${url}`);
		return;
	}
	const enabledEvents = [
		...new Set([...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES]),
	] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];
	await stripe.webhookEndpoints.create({
		connect: true,
		enabled_events: enabledEvents,
		url,
	});
	log(`stripe webhook endpoint registered: ${url}`);
}

export async function deleteConnectWebhook(baseUrl: string): Promise<void> {
	const stripe = stripeClient();
	if (!stripe) return;
	const endpoint = await findEndpoint(stripe, `${baseUrl}${CONNECT_PATH}`);
	if (!endpoint) return;
	await stripe.webhookEndpoints.del(endpoint.id);
	log(`stripe webhook endpoint released: ${endpoint.url}`);
}
