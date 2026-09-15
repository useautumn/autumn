import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { createTwStripeRequestDeadline } from "./twStripeLimiter/createTwStripeRequestDeadline";
import { isTwWorkerMode } from "./twStripeLimiter/twStripeMode";
import { getTwStripeRequestDeadline } from "./twStripeLimiter/twStripeRequestContext";

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
		const deadline =
			getTwStripeRequestDeadline() ??
			createTwStripeRequestDeadline({ timeoutMs: args[7] });
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
				timeoutMs: deadline.remainingMs(),
				requestTimeoutMs: args[7],
				signal: deadline.signal,
			});
			const startedAt = performance.now();
			let networkMs = 0;
			let response: Awaited<ReturnType<StripeHttpClient["makeRequest"]>>;
			try {
				const requestArgs: MakeRequestArgs = [...args];
				requestArgs[7] = Math.min(args[7], deadline.remainingMs());
				response = await originalMakeRequest(...requestArgs);
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
			const retryDelayMs = backoffMs / 2 + (Math.random() * backoffMs) / 2;
			if (retryDelayMs >= deadline.remainingMs()) return response;
			await deadline.sleep(retryDelayMs);
		}
	};
	return client;
};
