import { afterEach, beforeEach, expect, test } from "bun:test";
import Stripe from "stripe";
import { applyTwStripeConcurrencyLimit } from "../../../src/external/connect/clientCache/twStripeConcurrencyLimit";
import { getTwStripeRedis } from "../../../src/external/connect/clientCache/twStripeLimiter/getTwStripeRedis";
import { withTwStripeFileTag } from "../../../src/external/connect/clientCache/twStripeLimiter/twStripeRequestContext";

const envNames = [
	"TW_WORKER_MODE",
	"TW_STRIPE_MAX_RPS",
	"TW_STRIPE_MAX_INFLIGHT",
	"TW_STRIPE_REDIS_URL",
	"TW_TEST_FILE",
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
	delete process.env.TW_TEST_FILE;
});

afterEach(() => {
	for (const name of envNames) {
		if (originalEnv[name] === undefined) delete process.env[name];
		else process.env[name] = originalEnv[name];
	}
});

const createClient = ({
	status = 200,
	delayMs = 0,
}: { status?: number; delayMs?: number } = {}) =>
	applyTwStripeConcurrencyLimit({
		client: new Stripe(`sk_test_file_stats_${crypto.randomUUID()}`, {
			maxNetworkRetries: 0,
			httpClient: Stripe.createFetchHttpClient(async () => {
				await Bun.sleep(delayMs);
				return Response.json(
					status === 429
						? { error: { type: "invalid_request_error", code: "rate_limit" } }
						: { object: "balance" },
					{
						status,
						headers:
							status === 429
								? { "stripe-rate-limited-reason": "global-rate" }
								: {},
					},
				);
			}),
		}),
	});

const readFileHash = (fileTag: string) =>
	getTwStripeRedis().hgetall(`tw:fs:file:${fileTag}`);

test("test-process requests count against the file in TW_TEST_FILE", async () => {
	const fileTag = `file-${crypto.randomUUID()}`;
	process.env.TW_TEST_FILE = fileTag;
	const client = createClient({ delayMs: 50 });
	await Promise.all([client.balance.retrieve(), client.balance.retrieve()]);

	const stats = await readFileHash(fileTag);
	expect(Number(stats.req_test)).toBe(2);
	expect(stats.req_server).toBeUndefined();
	expect(Number(stats.inflight_max)).toBeGreaterThanOrEqual(1);
	expect(Number(stats.busy_ms)).toBeGreaterThanOrEqual(90);
	const perSecond = Object.entries(stats)
		.filter(([name]) => name.startsWith("s:"))
		.reduce((sum, [, value]) => sum + Number(value), 0);
	expect(perSecond).toBe(2);
});

test("server requests carry the tag of the test call that caused them", async () => {
	const fileTag = `file-${crypto.randomUUID()}`;
	const client = createClient();
	await withTwStripeFileTag({ fileTag, run: () => client.balance.retrieve() });

	const stats = await readFileHash(fileTag);
	expect(Number(stats.req_server)).toBe(1);
	expect(stats.req_test).toBeUndefined();
});

test("untagged requests land in the worker's per-second untagged bucket", async () => {
	const second = Math.floor(Date.now() / 1000);
	const before = await getTwStripeRedis().hmget(
		"tw:fs:machine",
		`u:${second}`,
		`u:${second + 1}`,
	);
	await createClient().balance.retrieve();
	const after = await getTwStripeRedis().hmget(
		"tw:fs:machine",
		`u:${second}`,
		`u:${second + 1}`,
	);
	const total = (values: (string | null)[]) =>
		values.reduce((sum, value) => sum + Number(value ?? 0), 0);
	expect(total(after) - total(before)).toBeGreaterThanOrEqual(1);
});

test("429s are counted with Stripe's rate-limited reason", async () => {
	const fileTag = `file-${crypto.randomUUID()}`;
	process.env.TW_TEST_FILE = fileTag;
	const client = createClient({ status: 429 });
	await client.balance
		.retrieve({}, { timeout: 2_000, maxNetworkRetries: 0 })
		.catch(() => undefined);

	const stats = await readFileHash(fileTag);
	expect(Number(stats.r429)).toBeGreaterThanOrEqual(1);
	expect(Number(stats["rl:global-rate"])).toBe(Number(stats.r429));
	expect(Number(stats.req_test)).toBe(Number(stats.r429));
});
