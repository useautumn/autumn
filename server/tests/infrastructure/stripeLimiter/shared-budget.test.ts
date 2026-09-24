import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import { stripeBudgetForRun } from "../../../../scripts/tw/helpers/stripeBudget";
import { applyTwStripeConcurrencyLimit } from "../../../src/external/connect/clientCache/twStripeConcurrencyLimit";
import { acquireTwStripePermit } from "../../../src/external/connect/clientCache/twStripeLimiter/acquireTwStripePermit";
import { getTwStripeRedis } from "../../../src/external/connect/clientCache/twStripeLimiter/getTwStripeRedis";
import {
	getTwStripeLane,
	withTwStripeWebhookPriority,
} from "../../../src/external/connect/clientCache/twStripeLimiter/twStripeRequestContext";
import { runStripeClockRequest } from "../../utils/stripeUtils/testClock/runStripeClockRequest";
import { createTestWait } from "../../utils/testWait/createTestWait";

const envNames = [
	"TW_WORKER_MODE",
	"TW_STRIPE_MAX_RPS",
	"TW_STRIPE_MAX_INFLIGHT",
	"TW_STRIPE_REDIS_URL",
	"NODE_ENV",
];
const originalEnv = Object.fromEntries(
	envNames.map((name) => [name, process.env[name]]),
);
beforeEach(() => {
	process.env.TW_WORKER_MODE = "1";
	process.env.NODE_ENV = "test";
	process.env.TW_STRIPE_MAX_RPS = "20";
	process.env.TW_STRIPE_MAX_INFLIGHT = "8";
	process.env.TW_STRIPE_REDIS_URL ??= "redis://127.0.0.1:6379";
});

afterEach(() => {
	for (const name of envNames) {
		if (originalEnv[name] === undefined) delete process.env[name];
		else process.env[name] = originalEnv[name];
	}
});

test("clients sharing a Stripe secret share one allowance across client cache keys", async () => {
	const sent: number[] = [];
	const secret = `sk_test_limiter_${crypto.randomUUID()}`;
	const clients = Array.from({ length: 3 }, () => {
		const client = new Stripe(secret, {
			maxNetworkRetries: 0,
			httpClient: Stripe.createFetchHttpClient(async () => {
				sent.push(performance.now());
				return Response.json({
					object: "balance",
					available: [],
					pending: [],
					livemode: false,
				});
			}),
		});
		return applyTwStripeConcurrencyLimit({ client });
	});
	await Promise.all(clients.map((client) => client.balance.retrieve()));
	expect(sent).toHaveLength(3);
	expect(sent[2] - sent[0]).toBeGreaterThanOrEqual(90);
});

// Connected-account traffic previously used only the faster platform allowance.
test("connected-account clients share five requests per second across default and per-request headers", async () => {
	const secret = `sk_test_limiter_${crypto.randomUUID()}`;
	const account = `acct_${crypto.randomUUID()}`;
	const sent: number[] = [];
	const clients = [account, undefined].map((stripeAccount) =>
		applyTwStripeConcurrencyLimit({
			client: new Stripe(secret, {
				stripeAccount,
				maxNetworkRetries: 0,
				httpClient: Stripe.createFetchHttpClient(async () => {
					sent.push(performance.now());
					return Response.json({ object: "balance" });
				}),
			}),
		}),
	);
	await Promise.all(
		Array.from({ length: 6 }, (_, index) =>
			index % 2 === 0
				? clients[0].balance.retrieve()
				: clients[1].balance.retrieve({}, { stripeAccount: account }),
		),
	);
	expect(sent).toHaveLength(6);
	for (let index = 1; index < sent.length; index++)
		expect(sent[index] - sent[index - 1]).toBeGreaterThanOrEqual(190);
});

test("another connected account can use the platform budget while a busy account waits", async () => {
	const sent: string[] = [];
	const first = Promise.withResolvers<void>();
	const client = applyTwStripeConcurrencyLimit({
		client: new Stripe(`sk_test_limiter_${crypto.randomUUID()}`, {
			maxNetworkRetries: 0,
			httpClient: Stripe.createFetchHttpClient(
				async (_url: RequestInfo | URL, options?: RequestInit) => {
					const account = new Headers(options?.headers).get("stripe-account")!;
					sent.push(account);
					first.resolve();
					return Response.json({ object: "balance" });
				},
			),
		}),
	});
	const busy = Array.from({ length: 6 }, () =>
		client.balance.retrieve({}, { stripeAccount: "acct_busy" }),
	);
	await first.promise;
	await client.balance.retrieve({}, { stripeAccount: "acct_other" });
	expect(sent.indexOf("acct_other")).toBeLessThan(3);
	await Promise.all(busy);
});

test("a webhook overtakes queued bulk reads without waiting for the batch to drain", async () => {
	const sent: string[] = [];
	const first = Promise.withResolvers<void>();
	const client = applyTwStripeConcurrencyLimit({
		client: new Stripe(`sk_test_${crypto.randomUUID()}`, {
			maxNetworkRetries: 0,
			httpClient: Stripe.createFetchHttpClient(
				async (url: RequestInfo | URL) => {
					sent.push(String(url).includes("balance") ? "webhook" : "bulk");
					first.resolve();
					return Response.json({ object: "list", data: [], has_more: false });
				},
			),
		}),
	});
	const bulk = Array.from({ length: 36 }, () =>
		client.invoices.list({ limit: 1 }),
	);
	await first.promise;
	const webhook = withTwStripeWebhookPriority(() => client.balance.retrieve());
	await Promise.all([...bulk, webhook]);
	expect(sent).toHaveLength(37);
	expect(sent.indexOf("webhook")).toBeLessThan(4);
});

test("non-TW and production clients keep the original HTTP method", async () => {
	for (const [mode, nodeEnv] of [
		["0", "test"],
		["1", "production"],
	]) {
		process.env.TW_WORKER_MODE = mode;
		process.env.NODE_ENV = nodeEnv;
		delete process.env.TW_STRIPE_REDIS_URL;
		const httpClient = Stripe.createFetchHttpClient(async () =>
			Response.json({ object: "balance" }),
		);
		const original = httpClient.makeRequest;
		const client = new Stripe("sk_test_disabled", { httpClient });
		expect(applyTwStripeConcurrencyLimit({ client })).toBe(client);
		expect(httpClient.makeRequest).toBe(original);
		await client.balance.retrieve();
		expect(withTwStripeWebhookPriority(getTwStripeLane)).toBe("bulk");
	}
});

test("transport failures release their in-flight permit", async () => {
	process.env.TW_STRIPE_MAX_INFLIGHT = "2";
	let attempts = 0;
	const client = applyTwStripeConcurrencyLimit({
		client: new Stripe(`sk_test_${crypto.randomUUID()}`, {
			maxNetworkRetries: 0,
			httpClient: Stripe.createFetchHttpClient(async () => {
				attempts++;
				if (attempts === 1) throw new Error("synthetic connection failure");
				return Response.json({ object: "balance" });
			}),
		}),
	});
	await expect(client.balance.retrieve()).rejects.toThrow();
	await client.balance.retrieve();
	expect(attempts).toBe(2);
});

test("a Stripe request expires in the admission queue without being sent later", async () => {
	process.env.TW_STRIPE_MAX_INFLIGHT = "2";
	const secret = `sk_test_deadline_${crypto.randomUUID()}`;
	const held = await acquireTwStripePermit({
		authorization: `Bearer ${secret}`,
		timeoutMs: 1000,
	});
	let sent = 0;
	const client = applyTwStripeConcurrencyLimit({
		client: new Stripe(secret, {
			maxNetworkRetries: 0,
			httpClient: Stripe.createFetchHttpClient(async () => {
				sent++;
				return Response.json({ object: "balance" });
			}),
		}),
	});
	const release = setTimeout(() => void held.release(), 200);
	try {
		await expect(
			client.balance.retrieve({}, { timeout: 40 }),
		).rejects.toThrow();
		expect(sent).toBe(0);
	} finally {
		clearTimeout(release);
		await held.release();
	}
	await client.balance.retrieve({}, { timeout: 1000 });
	expect(sent).toBe(1);
});

test("429 backoff consumes the request deadline instead of restarting it", async () => {
	let sent = 0;
	const client = applyTwStripeConcurrencyLimit({
		client: new Stripe(`sk_test_deadline_${crypto.randomUUID()}`, {
			maxNetworkRetries: 0,
			httpClient: Stripe.createFetchHttpClient(async () => {
				sent++;
				return Response.json(
					{ error: { message: "synthetic limit" } },
					{ status: 429 },
				);
			}),
		}),
	});
	const started = performance.now();
	await expect(client.balance.retrieve({}, { timeout: 40 })).rejects.toThrow();
	expect(sent).toBe(1);
	expect(performance.now() - started).toBeLessThan(500);
});

test("a retry receives only the network time remaining after backoff", async () => {
	const timeouts: number[] = [];
	const httpClient = Stripe.createFetchHttpClient(async () =>
		timeouts.length === 1
			? Response.json(
					{ error: { message: "synthetic limit" } },
					{ status: 429 },
				)
			: Response.json({ object: "balance" }),
	);
	const makeRequest = httpClient.makeRequest.bind(httpClient);
	httpClient.makeRequest = (...args) => {
		timeouts.push(args[7]);
		return makeRequest(...args);
	};
	const client = applyTwStripeConcurrencyLimit({
		client: new Stripe(`sk_test_deadline_${crypto.randomUUID()}`, {
			maxNetworkRetries: 0,
			httpClient,
		}),
	});
	await client.balance.retrieve({}, { timeout: 1000 });
	expect(timeouts).toHaveLength(2);
	expect(timeouts[0]).toBeLessThanOrEqual(1000);
	expect(timeouts[0] - timeouts[1]).toBeGreaterThanOrEqual(120);
});

test("clock admission uses the operation budget while preserving the network timeout", async () => {
	process.env.TW_STRIPE_MAX_INFLIGHT = "2";
	const secret = `sk_test_clock_budget_${crypto.randomUUID()}`;
	const held = await acquireTwStripePermit({
		authorization: `Bearer ${secret}`,
		timeoutMs: 1000,
	});
	const timeouts: number[] = [];
	const httpClient = Stripe.createFetchHttpClient(async () =>
		Response.json({ object: "balance" }),
	);
	const makeRequest = httpClient.makeRequest.bind(httpClient);
	httpClient.makeRequest = (...args) => {
		timeouts.push(args[7]);
		return makeRequest(...args);
	};
	const client = applyTwStripeConcurrencyLimit({
		client: new Stripe(secret, { maxNetworkRetries: 0, httpClient }),
	});
	const wait = createTestWait({
		timeoutMs: 1000,
		description: "clock operation",
	});
	const release = setTimeout(() => void held.release(), 120);
	const started = performance.now();
	try {
		await runStripeClockRequest({
			wait,
			run: () => client.balance.retrieve({}, { timeout: 40 }),
		});
		expect(performance.now() - started).toBeGreaterThanOrEqual(100);
		expect(timeouts).toEqual([40]);
	} finally {
		clearTimeout(release);
		await held.release();
		wait.close();
	}
});

test("cancelling a clock wait removes its queued SDK request before admission", async () => {
	process.env.TW_STRIPE_MAX_INFLIGHT = "2";
	const secret = `sk_test_clock_cancel_${crypto.randomUUID()}`;
	const held = await acquireTwStripePermit({
		authorization: `Bearer ${secret}`,
		timeoutMs: 1000,
	});
	let sent = 0;
	const client = applyTwStripeConcurrencyLimit({
		client: new Stripe(secret, {
			maxNetworkRetries: 0,
			httpClient: Stripe.createFetchHttpClient(async () => {
				sent++;
				return Response.json({ object: "balance" });
			}),
		}),
	});
	const controller = new AbortController();
	const wait = createTestWait({
		timeoutMs: 1000,
		description: "clock operation",
		signal: controller.signal,
	});
	try {
		const request = runStripeClockRequest({
			wait,
			run: () => client.balance.retrieve({}, { timeout: 1000 }),
		});
		await Bun.sleep(20);
		controller.abort(new Error("clock operation cancelled"));
		await expect(request).rejects.toThrow("clock operation cancelled");
	} finally {
		wait.close();
		await held.release();
	}
	await client.balance.retrieve({}, { timeout: 1000 });
	expect(sent).toBe(1);
});

test("a long operation budget does not extend a short request's crash lease", async () => {
	const authorization = `Bearer sk_test_lease_${crypto.randomUUID()}`;
	const permit = await acquireTwStripePermit({
		authorization,
		timeoutMs: 60_000,
		requestTimeoutMs: 40,
	});
	try {
		const fingerprint = createHash("sha256")
			.update(authorization)
			.digest("hex");
		const entries = await getTwStripeRedis().zrange(
			`tw:stripe:{${fingerprint}}:active`,
			0,
			-1,
			"WITHSCORES",
		);
		expect(entries).toHaveLength(2);
		expect(Number(entries[1]) - Date.now()).toBeLessThanOrEqual(6000);
		expect(Number(entries[1]) - Date.now()).toBeGreaterThan(4000);
	} finally {
		await permit.release();
	}
});

test("webhook priority survives deferred execution without leaking into bulk work", async () => {
	const lane = await withTwStripeWebhookPriority(
		() =>
			new Promise<string>((resolve) => {
				setImmediate(() => resolve(getTwStripeLane()));
			}),
	);
	expect(lane).toBe("webhook");
	expect(getTwStripeLane()).toBe("bulk");
});

test("worker allocations never multiply the per-key budget", () => {
	expect(stripeBudgetForRun({ workers: 1, keys: 152 })).toEqual({
		maxRps: 20,
		maxInFlight: 8,
	});
	expect(stripeBudgetForRun({ workers: 200, keys: 152 })).toEqual({
		maxRps: 10,
		maxInFlight: 4,
	});
	expect(stripeBudgetForRun({ workers: 4, keys: 1 })).toEqual({
		maxRps: 5,
		maxInFlight: 2,
	});
	expect(() => stripeBudgetForRun({ workers: 5, keys: 1 })).toThrow(
		"reduce --max",
	);
});

test.each([undefined, "acct_process_shared"])(
	"three independent test processes share the same allowance for %s",
	async (account) => {
		const secret = `sk_test_processes_${crypto.randomUUID()}`;
		const fixture = `${import.meta.dir}/fixtures/stripeLimiterWorker.ts`;
		const children = Array.from({ length: 3 }, () =>
			Bun.spawn([process.execPath, fixture], {
				cwd: "/tmp",
				stdout: "pipe",
				stderr: "pipe",
				env: {
					...process.env,
					TW_STRIPE_PROBE_SECRET: secret,
					TW_STRIPE_PROBE_ACCOUNT: account,
				},
			}),
		);
		const outputs = await Promise.all(
			children.map(async (child) => {
				const [stdout, stderr, exitCode] = await Promise.all([
					new Response(child.stdout).text(),
					new Response(child.stderr).text(),
					child.exited,
				]);
				expect(exitCode, stderr).toBe(0);
				return JSON.parse(stdout) as number[];
			}),
		);
		const sent = outputs.flat().sort((a, b) => a - b);
		expect(sent).toHaveLength(9);
		expect(sent[8] - sent[0]).toBeGreaterThanOrEqual(account ? 1580 : 380);
	},
);
