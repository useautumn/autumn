import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type Stripe from "stripe";
import { isTwWorkerMode } from "./twStripeLimiter/twStripeMode";

export { isTwWorkerMode } from "./twStripeLimiter/twStripeMode";

const patched = new WeakSet<object>();
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 250;
type StripeHttpClient = NonNullable<Stripe.StripeConfig["httpClient"]>;
type MakeRequestArgs = Parameters<StripeHttpClient["makeRequest"]>;

export const applyTwStripeConcurrencyLimit = ({
	client,
}: {
	client: Stripe;
}): Stripe => {
	if (!isTwWorkerMode()) return client;
	const httpClient = (
		client as Stripe & { _api?: { httpClient?: StripeHttpClient } }
	)._api?.httpClient;
	if (!httpClient || patched.has(httpClient)) return client;
	patched.add(httpClient);
	const originalMakeRequest = httpClient.makeRequest.bind(httpClient);

	httpClient.makeRequest = async (...args: MakeRequestArgs) => {
		if (!isTwWorkerMode()) return originalMakeRequest(...args);
		// Redis is never initialized or imported by the production request path.
		const { acquireTwStripePermit } = await import(
			"./twStripeLimiter/acquireTwStripePermit"
		);
		const headers = args[4] as Record<string, unknown>;
		const authorization = headers.Authorization ?? headers.authorization;
		const stripeAccount =
			headers["Stripe-Account"] ?? headers["stripe-account"];
		if (typeof authorization !== "string")
			throw new Error("Stripe request has no authorization header");
		const traceRequestId =
			process.env.TW_STRIPE_TRACE === "1" ? randomUUID() : undefined;

		for (let attempt = 0; ; attempt++) {
			const permit = await acquireTwStripePermit({
				authorization,
				stripeAccount:
					typeof stripeAccount === "string" ? stripeAccount : undefined,
				timeoutMs: args[7],
			});
			const startedAt = performance.now();
			let networkMs = 0;
			let response: Awaited<ReturnType<StripeHttpClient["makeRequest"]>>;
			try {
				response = await originalMakeRequest(...args);
				networkMs = Math.round(performance.now() - startedAt);
			} finally {
				await permit.release();
			}
			if (process.env.TW_STRIPE_TRACE === "1") {
				const responseHeaders = response.getHeaders();
				// Only allow known resource names; paths and queries can contain customer data.
				const endpoint =
					args[2].match(
						/^\/(v1\/(?:accounts|balance|billing|billing_portal|charges|checkout|coupons|customers|events|invoiceitems|invoices|payment_intents|payment_methods|prices|products|promotion_codes|setup_intents|subscription_items|subscription_schedules|subscriptions|tax|test_helpers|webhook_endpoints)|v2\/core\/accounts)(?:[/?]|$)/,
					)?.[1] ?? "other";
				console.log(
					JSON.stringify({
						event: "tw.stripe.request",
						at: new Date().toISOString(),
						traceRequestId,
						pid: process.pid,
						method: args[3],
						endpoint,
						stripeRequestId: responseHeaders["request-id"] ?? null,
						rateLimitedReason:
							responseHeaders["stripe-rate-limited-reason"] ?? null,
						lane: permit.lane,
						waitMs: permit.waitMs,
						networkMs,
						status: response.getStatusCode(),
						attempt,
					}),
				);
			}
			if (response.getStatusCode() !== 429 || attempt >= MAX_RETRIES)
				return response;
			const backoffMs = BASE_BACKOFF_MS * 2 ** attempt;
			await delay(backoffMs / 2 + (Math.random() * backoffMs) / 2);
		}
	};
	return client;
};
