import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { registerTwStripeAccount } from "../../utils/stripeUtils/registerTwStripeAccount";

const configuration = {
	TW_WORKER_MODE: "1",
	NODE_ENV: "test",
	TW_STRIPE_INGRESS_URL: "http://ingress.test",
	TW_STRIPE_INGRESS_TOKEN: "test-token",
	STRIPE_ACCOUNT_ID: "acct_worker",
};
const original = Object.fromEntries(
	Object.keys(configuration).map((key) => [key, process.env[key]]),
);
beforeEach(() => Object.assign(process.env, configuration));
afterEach(() => {
	mock.restore();
	for (const [key, value] of Object.entries(original)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

test("sub-organization registration uses the owning worker and a bounded request", async () => {
	const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
		new Response("{}"),
	);
	await registerTwStripeAccount({ accountId: "acct_child" });
	expect(fetch).toHaveBeenCalledTimes(1);
	const [url, options] = fetch.mock.calls[0]!;
	expect(url).toBe("http://ingress.test/ingress/map");
	expect(options?.signal).toBeInstanceOf(AbortSignal);
	expect(new Headers(options?.headers).get("x-ingress-token")).toBe(
		"test-token",
	);
	expect(JSON.parse(String(options?.body))).toEqual({
		accountId: "acct_child",
		workerAccountId: "acct_worker",
	});
});

test("failed registration stops setup instead of silently losing webhooks", async () => {
	spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(null, { status: 400 }),
	);
	await expect(
		registerTwStripeAccount({ accountId: "acct_child" }),
	).rejects.toThrow("registration failed: HTTP 400");
});

test("missing worker routing configuration fails before sending a request", async () => {
	delete process.env.TW_STRIPE_INGRESS_URL;
	const fetch = spyOn(globalThis, "fetch");
	await expect(
		registerTwStripeAccount({ accountId: "acct_child" }),
	).rejects.toThrow("routing is not configured");
	expect(fetch).not.toHaveBeenCalled();
});

test("local and production contexts do not register test routes", async () => {
	const fetch = spyOn(globalThis, "fetch");
	process.env.TW_WORKER_MODE = "0";
	await registerTwStripeAccount({ accountId: "acct_child" });
	process.env.TW_WORKER_MODE = "1";
	process.env.NODE_ENV = "production";
	await registerTwStripeAccount({ accountId: "acct_child" });
	expect(fetch).not.toHaveBeenCalled();
});
