import { afterEach, beforeEach, expect, test } from "bun:test";
import Stripe from "stripe";
import { stripeBudgetForRun } from "../../../../scripts/tw/helpers/stripeBudget";
import { applyTwStripeConcurrencyLimit } from "../../../src/external/connect/clientCache/twStripeConcurrencyLimit";
import {
	getTwStripeLane,
	withTwStripeWebhookPriority,
} from "../../../src/external/connect/clientCache/twStripeLimiter/twStripeRequestContext";

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
