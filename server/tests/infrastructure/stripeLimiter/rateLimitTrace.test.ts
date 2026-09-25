import { expect, test } from "bun:test";
import Stripe from "stripe";
import { readTwStripeRateLimitCode } from "../../../src/external/connect/clientCache/twStripeLimiter/readTwStripeRateLimitCode";

const createResponse = async (body: object) =>
	Stripe.createFetchHttpClient(async () =>
		Response.json(body, { status: 429 }),
	).makeRequest(
		"stripe.fixture",
		443,
		"/v1/invoices",
		"GET",
		{},
		null,
		"https",
		1000,
	);

test("rate limit tracing preserves the single-use response body for the SDK", async () => {
	const payload = {
		error: { code: "lock_timeout", message: "Synthetic error" },
	};
	const response = await createResponse(payload);
	expect(await readTwStripeRateLimitCode({ response, timeoutMs: 1000 })).toBe(
		"lock_timeout",
	);
	expect(await response.toJSON()).toEqual(payload);
});

test("rate limit tracing does not return messages or arbitrary response values", async () => {
	for (const code of [
		undefined,
		"user@example.com",
		"acct_123",
		{ value: "x" },
	]) {
		const response = await createResponse({
			error: { code, message: "private" },
		});
		expect(
			await readTwStripeRateLimitCode({ response, timeoutMs: 1000 }),
		).toBeNull();
	}
});

test("reading an error body cannot extend the request deadline", async () => {
	const response = await createResponse({});
	const pending = Promise.withResolvers<object>();
	response.toJSON = () => pending.promise;
	try {
		await expect(
			readTwStripeRateLimitCode({ response, timeoutMs: 20 }),
		).rejects.toThrow("exceeded the request deadline");
	} finally {
		pending.resolve({});
	}
});
