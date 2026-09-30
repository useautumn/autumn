import { afterEach, expect, test } from "bun:test";
import { fetchStripeOpenApiSpec } from "@/internal/stripeRead/actions/searchStripeEndpoints/getStripeEndpointSearch.js";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

test("the Stripe spec fetch carries a deadline", async () => {
	let signal: AbortSignal | undefined;
	globalThis.fetch = (async (_url: string, init?: RequestInit) => {
		signal = init?.signal ?? undefined;
		return new Response("{}");
	}) as typeof fetch;

	await fetchStripeOpenApiSpec();
	expect(signal).toBeInstanceOf(AbortSignal);
});
