import { afterEach, beforeEach, expect, test } from "bun:test";
import Stripe from "stripe";
import { applyTwStripeConcurrencyLimit } from "../../../src/external/connect/clientCache/twStripeConcurrencyLimit";

const envNames = [
	"TW_WORKER_MODE",
	"TW_STRIPE_IDEMPOTENCY_NAMESPACE",
	"TW_STRIPE_REDIS_URL",
	"TW_STRIPE_MAX_RPS",
	"TW_STRIPE_MAX_INFLIGHT",
	"NODE_ENV",
] as const;
const originalEnv = Object.fromEntries(
	envNames.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
	process.env.TW_WORKER_MODE = "1";
	process.env.TW_STRIPE_IDEMPOTENCY_NAMESPACE = "worker-a";
	process.env.TW_STRIPE_REDIS_URL ??= "redis://127.0.0.1:6379";
	process.env.TW_STRIPE_MAX_RPS = "20";
	process.env.TW_STRIPE_MAX_INFLIGHT = "8";
	process.env.NODE_ENV = "test";
});

afterEach(() => {
	for (const name of envNames) {
		if (originalEnv[name] === undefined) delete process.env[name];
		else process.env[name] = originalEnv[name];
	}
});

const createClient = ({
	keys,
	maxNetworkRetries = 0,
	failFirstRequest = false,
	rateLimitFirstRequest = false,
}: {
	keys: (string | null)[];
	maxNetworkRetries?: number;
	failFirstRequest?: boolean;
	rateLimitFirstRequest?: boolean;
}) =>
	applyTwStripeConcurrencyLimit({
		client: new Stripe(`sk_test_${crypto.randomUUID()}`, {
			maxNetworkRetries,
			httpClient: Stripe.createFetchHttpClient(
				async (_url: RequestInfo | URL, options?: RequestInit) => {
					keys.push(new Headers(options?.headers).get("idempotency-key"));
					if (failFirstRequest && keys.length === 1)
						throw new Error("connection reset after sending request");
					if (rateLimitFirstRequest && keys.length === 1)
						return Response.json(
							{ error: { type: "rate_limit_error" } },
							{ status: 429 },
						);
					return Response.json({ id: "prod_test", object: "product" });
				},
			),
		}),
	});

test("a reused account gets fresh keys after a worker's database is replaced", async () => {
	const keys: (string | null)[] = [];
	const request = { idempotencyKey: "autumn:product:feature:seeded-id" };
	const params = { name: "Messages" };
	const first = createClient({ keys });
	const second = createClient({ keys });
	await first.products.create(params, request);
	await second.products.create(params, request);
	process.env.TW_STRIPE_IDEMPOTENCY_NAMESPACE = "worker-b";
	await first.products.create(params, request);

	expect(keys[0]).toBe(keys[1]);
	expect(keys[2]).not.toBe(keys[0]);
	expect(keys.every((key) => key?.startsWith("autumn:"))).toBe(true);
	expect(request.idempotencyKey).toBe("autumn:product:feature:seeded-id");
});

test("SDK network retries keep exactly the same namespaced key", async () => {
	const keys: (string | null)[] = [];
	const client = createClient({
		keys,
		maxNetworkRetries: 1,
		failFirstRequest: true,
	});
	await client.products.create(
		{ name: "Messages" },
		{ idempotencyKey: "autumn:product:feature:seeded-id" },
	);
	expect(keys).toHaveLength(2);
	expect(keys[0]).toBe(keys[1]);
	expect(keys[0]).not.toBe("autumn:product:feature:seeded-id");
});

test("TW rate-limit retries keep exactly the same namespaced key", async () => {
	const keys: (string | null)[] = [];
	await createClient({ keys, rateLimitFirstRequest: true }).products.create(
		{ name: "Messages" },
		{ idempotencyKey: "autumn:product:feature:seeded-id" },
	);
	expect(keys).toHaveLength(2);
	expect(keys[0]).toBe(keys[1]);
	expect(keys[0]).not.toBe("autumn:product:feature:seeded-id");
});

test("key length, origin classification, and requests without keys are preserved", async () => {
	const keys: (string | null)[] = [];
	const client = createClient({ keys });
	for (const suffix of ["a", "b"]) {
		await client.products.create(
			{ name: "Messages" },
			{ idempotencyKey: `${"x".repeat(254)}${suffix}` },
		);
	}
	await client.products.create({ name: "Messages" });
	expect(keys[0]?.length).toBeLessThanOrEqual(255);
	expect(keys[0]?.startsWith("autumn:")).toBe(false);
	expect(keys[0]).not.toBe(keys[1]);
	expect(keys[2]).toBeNull();
});

test("local and production clients keep their original idempotency keys", async () => {
	for (const [mode, nodeEnv] of [
		["0", "test"],
		["1", "production"],
	]) {
		process.env.TW_WORKER_MODE = mode;
		process.env.NODE_ENV = nodeEnv;
		const keys: (string | null)[] = [];
		await createClient({ keys }).products.create(
			{ name: "Messages" },
			{ idempotencyKey: "autumn:product:feature:seeded-id" },
		);
		expect(keys).toEqual(["autumn:product:feature:seeded-id"]);
	}
});
