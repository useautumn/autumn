import { afterEach, beforeEach, expect, test } from "bun:test";
import Stripe from "stripe";
import { applyTwStripeConcurrencyLimit } from "../../../src/external/connect/clientCache/twStripeConcurrencyLimit";
import {
	withTwStripeRequestDeadline,
	withTwStripeWebhookPriority,
} from "../../../src/external/connect/clientCache/twStripeLimiter/twStripeRequestContext";

const envNames = [
	"TW_WORKER_MODE",
	"NODE_ENV",
	"TW_STRIPE_MAX_RPS",
	"TW_STRIPE_MAX_INFLIGHT",
];
const originalEnv = Object.fromEntries(
	envNames.map((name) => [name, process.env[name]]),
);
beforeEach(() => {
	process.env.TW_WORKER_MODE = "1";
	process.env.NODE_ENV = "test";
	process.env.TW_STRIPE_MAX_RPS = "20";
	process.env.TW_STRIPE_MAX_INFLIGHT = "8";
});
afterEach(() => {
	for (const name of envNames) {
		if (originalEnv[name] === undefined) delete process.env[name];
		else process.env[name] = originalEnv[name];
	}
});

const createFixture = ({
	clockStatus = "advancing",
	hasTestClock = true,
}: {
	clockStatus?: string;
	hasTestClock?: boolean;
} = {}) => {
	const requests: { path: string; method: string; headers: Headers }[] = [];
	const clockRead = Promise.withResolvers<void>();
	let status = clockStatus;
	const client = applyTwStripeConcurrencyLimit({
		client: new Stripe(`sk_test_${crypto.randomUUID()}`, {
			maxNetworkRetries: 0,
			httpClient: Stripe.createFetchHttpClient(
				async (url: RequestInfo | URL, options?: RequestInit) => {
					const path = new URL(String(url)).pathname;
					const method = options?.method ?? "GET";
					requests.push({
						path,
						method,
						headers: new Headers(options?.headers),
					});
					if (method === "GET") {
						clockRead.resolve();
						const clock = { id: "clock_fixture", status, frozen_time: 100 };
						return Response.json(
							path.includes("subscription_schedules")
								? {
										id: "sub_sched_fixture",
										object: "subscription_schedule",
										test_clock: hasTestClock ? clock : null,
									}
								: clock,
						);
					}
					if (path.includes("subscription_schedules") && status !== "ready") {
						return Response.json(
							{
								error: {
									message:
										"Test clock advancement underway - cannot perform modifications",
								},
							},
							{ status: 429 },
						);
					}
					return Response.json({
						id: "fixture",
						object: "subscription_schedule",
						status: "released",
					});
				},
			),
		}),
	});
	const ready = () => {
		status = "ready";
	};
	return { client, requests, clockRead: clockRead.promise, ready };
};

test("schedule release waits for clock readiness without sending rejected mutations", async () => {
	const fixture = createFixture();
	const release = withTwStripeWebhookPriority(() =>
		fixture.client.subscriptionSchedules.release(
			"sub_sched_fixture",
			{},
			{ timeout: 5000 },
		),
	);
	const outcome = release.then(
		(value) => ({ value }),
		(error) => ({ error }),
	);
	await fixture.clockRead;
	expect(
		fixture.requests.filter((request) => request.method === "POST"),
	).toHaveLength(0);
	fixture.ready();
	expect(await outcome).toHaveProperty("value.status", "released");
	expect(
		fixture.requests.filter((request) => request.method === "POST"),
	).toHaveLength(1);
});

test("a failed clock prevents mutation and fails immediately", async () => {
	const fixture = createFixture({ clockStatus: "internal_failure" });
	const started = performance.now();
	await expect(
		fixture.client.subscriptionSchedules.release(
			"sub_sched_fixture",
			{},
			{ timeout: 1000 },
		),
	).rejects.toThrow();
	expect(fixture.requests).toHaveLength(1);
	expect(
		fixture.requests.filter((request) => request.method === "POST"),
	).toHaveLength(0);
	expect(performance.now() - started).toBeLessThan(500);
});

test("clock waiting consumes the existing deadline and never sends a late mutation", async () => {
	const fixture = createFixture();
	const started = performance.now();
	await expect(
		fixture.client.subscriptionSchedules.release(
			"sub_sched_fixture",
			{},
			{ timeout: 80 },
		),
	).rejects.toThrow();
	expect(fixture.requests).toHaveLength(1);
	fixture.ready();
	await Bun.sleep(100);
	expect(
		fixture.requests.filter((request) => request.method === "POST"),
	).toHaveLength(0);
	expect(performance.now() - started).toBeLessThan(500);
});

test("clock checks preserve request credentials and account overrides", async () => {
	const fixture = createFixture({ clockStatus: "ready" });
	await fixture.client.subscriptionSchedules.update(
		"sub_sched_fixture",
		{ metadata: { fixture: "yes" } },
		{
			apiKey: "sk_test_override",
			stripeAccount: `acct_${crypto.randomUUID()}`,
		},
	);
	expect(fixture.requests).toHaveLength(2);
	const [read, write] = fixture.requests;
	expect(read.headers.get("authorization")).toBe("Bearer sk_test_override");
	expect(read.headers.get("stripe-account")).toBe(
		write.headers.get("stripe-account"),
	);
	expect(read.headers.get("idempotency-key")).toBeNull();
});

test("waiting schedules leave renewal invoice writes able to proceed", async () => {
	const fixture = createFixture();
	const controller = new AbortController();
	const waiting = withTwStripeRequestDeadline({
		timeoutMs: 5000,
		signal: controller.signal,
		run: () =>
			withTwStripeWebhookPriority(() =>
				fixture.client.subscriptionSchedules.release("sub_sched_fixture"),
			),
	});
	const outcome = waiting.catch((error) => error);
	await fixture.clockRead;
	await withTwStripeWebhookPriority(() =>
		fixture.client.invoiceItems.create({
			customer: "cus_fixture",
			amount: 100,
			currency: "usd",
		}),
	);
	const cancelledAt = performance.now();
	controller.abort(new Error("test finished"));
	await outcome;
	expect(performance.now() - cancelledAt).toBeLessThan(500);
	expect(
		fixture.requests
			.filter((request) => request.method === "POST")
			.map((request) => request.path),
	).toEqual(["/v1/invoiceitems"]);
});

test("a schedule without a test clock needs no clock polling", async () => {
	const fixture = createFixture({ clockStatus: "ready", hasTestClock: false });
	await fixture.client.subscriptionSchedules.release("sub_sched_fixture");
	expect(fixture.requests.map((request) => request.method)).toEqual([
		"GET",
		"POST",
	]);
});

test("production and non-TW schedule mutations do not run readiness checks", async () => {
	for (const [mode, nodeEnv] of [
		["0", "test"],
		["1", "production"],
	]) {
		process.env.TW_WORKER_MODE = mode;
		process.env.NODE_ENV = nodeEnv;
		const fixture = createFixture({ clockStatus: "ready" });
		await fixture.client.subscriptionSchedules.release("sub_sched_fixture");
		expect(fixture.requests.map((request) => request.method)).toEqual(["POST"]);
	}
});
